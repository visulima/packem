/* eslint-disable @typescript-eslint/no-use-before-define, no-param-reassign, @typescript-eslint/no-shadow, func-style, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-non-null-assertion, unicorn/no-null, sonarjs/cognitive-complexity, jsdoc/match-description, @typescript-eslint/prefer-nullish-coalescing, no-plusplus, @typescript-eslint/restrict-template-expressions, sonarjs/function-return-type, sonarjs/different-types-comparison, no-return-assign, consistent-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-dynamic-delete, sonarjs/no-nested-assignment, sonarjs/no-empty-collection, no-secrets/no-secrets, no-await-in-loop, default-case -- this file implements a yuku-based AST transform; helper functions are hoisted as expressions to match the data flow, params are mutated for in-place rewriting, and several SonarJS / TS-strict rules clash with the in-place ESTree node rewriting this transform relies on */
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ExistingRawSourceMap, NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput, TransformPluginContext, TransformResult } from "rollup";
import { b, is, isIdentifierName, nameOf, walk } from "yuku-ast";
import { generate } from "yuku-codegen";
// eslint-disable-next-line import/no-namespace -- the ESTree/TS-ESTree node types are a large flat namespace; importing them one by one would add ~40 named type imports
import type * as t from "yuku-parser";
import type { ParseResult } from "yuku-parser";
import { parse } from "yuku-parser";

import { filenameDtsTo, filenameJsToDts, filenameToDts, RE_DTS, RE_DTS_MAP, RE_NODE_MODULES, replaceTemplateName, resolveTemplateFunction } from "./filename";
import type { OptionsResolved } from "./options";
import type { InlinableScript } from "./reference-directives";
import { appendInlinedScripts, loadReferencedScript } from "./reference-directives";

// input:
// export declare function x(xx: X): void

// to:            const x   = [1, () => X  ]
// after compile: const x$1 = [1, () => X$1]

// replace X with X$1
// output:
// export declare function x$1(xx: X$1): void

type Dependency = t.Expression & { replace?: (newNode: t.Node) => void };

const CROSS_CHUNK_PLACEHOLDER = "__rollup_dts_resolve__:";

// Declaration ids are generated and may not exist on disk, so only the directory is resolved.
const realpathOrSelf = (id: string): string => {
    try {
        return path.join(realpathSync(path.dirname(id)), path.basename(id));
    } catch {
        return id;
    }
};
// A declaration's type parameters become the parameters of the arrow function that carries its
// dependencies, so one named like a module-level import would shadow it and the import would be
// dropped as unused. The parameters are prefixed to keep the two apart and the prefix is stripped
// again when the original names are restored in `renderChunk`.
const TYPE_PARAM_PREFIX = "_$tp$";
const stripTypeParamPrefix = (name: string): string => (name.startsWith(TYPE_PARAM_PREFIX) ? name.slice(TYPE_PARAM_PREFIX.length) : name);
const restoreTypeParamName = (node: t.Node): void => {
    if (node.type === "Identifier") node.name = stripTypeParamPrefix(node.name);
};
const RE_FILE_DOC_TAG = /@(?:module|packageDocumentation|fileoverview|file)\b/;
const SOURCE_MAPPING_URL_MARKER = "//# sourceMappingURL=";

/** Rollup appends the comment as the last line, so only a trailing one is removed. */
const stripTrailingSourceMappingUrl = (code: string): string => {
    const index = code.lastIndexOf(SOURCE_MAPPING_URL_MARKER);

    return index !== -1 && !code.slice(index).trimEnd().includes("\n") ? code.slice(0, index).trimEnd() : code;
};

/**
 * `b.Literal` is typed for every literal shape at once, so it returns the whole
 * union. These two build the only literals this transform needs, already narrowed.
 */
const stringLiteral = (value: string): t.StringLiteral => {
    return { end: 0, raw: JSON.stringify(value), start: 0, type: "Literal", value };
};

const numericLiteral = (value: number): t.NumericLiteral => {
    return { end: 0, raw: String(value), start: 0, type: "Literal", value };
};

/** One placeholder per child node, carrying that node's source span for `renderChunk` to restore. */
const childPlaceholders = (children: t.Node[]): t.StringLiteral[] =>
    children.map((node) => {
        const placeholder = stringLiteral("");

        placeholder.start = node.start;
        placeholder.end = node.end;

        return placeholder;
    });

/** `export { ... }` with no declaration and no source, which is all this transform emits. */
const exportNamedDeclaration = (specifiers: t.ExportSpecifier[]): t.ExportNamedDeclaration =>
    b.ExportNamedDeclaration({ attributes: [], declaration: null, source: null, specifiers });

/**
 * A collection of type parameters grouped by parameter name
 */
type TypeParams = {
    name: string;
    typeParams: t.Identifier[];
}[];

interface OverloadInfo {
    children: t.Node[];
    childrenOffset: number;
    decl: t.Declaration;
    deps: Dependency[];
    depsOffset: number;
    params: TypeParams;
    paramsOffset: number;
}

interface DeclarationInfo {
    bindings: t.Identifier[];
    children: t.Node[];
    /** The runtime `children` array literal; merged overloads append their placeholders to it. */
    childrenNode?: t.ArrayExpression;
    decl: t.Declaration;
    deps: Dependency[];
    overloads?: OverloadInfo[];
    params: TypeParams;
    /** Number of children belonging to the primary declaration (before merging overloads) */
    primaryChildrenCount?: number;
    /** Number of deps belonging to the primary declaration (before merging overloads) */
    primaryDepsCount?: number;
    /** Number of params belonging to the primary declaration (before merging overloads) */
    primaryParamsCount?: number;
    resolvedModuleId?: string;
}

/** What a top-level declaration introduces: a type, a value, or both (class, enum, merged). */
type DeclarationMeaning = "both" | "type" | "value";

interface ModuleExports {
    /** Top-level declarations and what they mean. */
    declared: Map<string, DeclarationMeaning>;
    exportAlls: ExportAllInfo[];
    /** Exported name → the local binding it exports. */
    exportLocals: Map<string, string>;
    exports: Map<string, boolean>;
    /** Named/default imports: local name → what they import and from which resolved module. */
    imports: Map<string, { imported: string; source?: string }>;
    reExports: ReExportInfo[];
    typeOnlyLocals: Set<string>;
}

interface ReExportInfo {
    exported: string;
    local: string;
    source?: string;
    typeOnly: boolean;
}

interface ExportAllInfo {
    rawSource: string;
    source?: string;
    typeOnly: boolean;
}

interface ChunkExportInfo {
    typeOnlyExportAllSources: Set<string>;
    typeOnlyNames: Set<string>;
}

type NamespaceMap = Map<string, { local: t.Identifier | t.TSQualifiedName; stmt: t.ProgramStatement }>;

const createFakeJsPlugin = (
    { cjsDefault, sideEffects, sourcemap }: Pick<OptionsResolved, "sourcemap" | "cjsDefault" | "sideEffects">,
    entryChunkNames: ReadonlySet<string> = new Set<string>(),
): Plugin => {
    let declarationIndex = 0;
    const declarationMap = new Map<number /* declaration id */, DeclarationInfo>();
    const commentsMap = new Map<string /* filename */, t.Comment[]>();
    // `/// <reference path>` directives that point at a local global script, mapped to that script (see reference-directives.ts).
    const referencedScriptMap = new WeakMap<t.Comment, InlinableScript>();
    // The global scripts each module references. Kept per module, not per directive, so that any chunk can find
    // which other chunks inline the same script (see `getScriptOwners`).
    const moduleScriptsMap = new Map<string /* filename */, InlinableScript[]>();
    // Per render: the chunk file that inlines each script, computed once from the chunk graph of that output.
    let scriptOwners: Map<string /* script file */, string /* chunk file name */> | undefined;
    // Leading JSDoc of specifier-based export statements, which — unlike declarations — are
    // handed to rollup verbatim and would otherwise be lost to the `comments: false` print
    // at the end of `transform`. Re-attached by name in `renderChunk`.
    const exportCommentsMap = new Map<string /* filename */, ExportComments>();
    // A file's own doc comment (`@module`, `@packageDocumentation`) sits on its first statement.
    // When that statement is an import or `export … from`, the statement keeps no comments, so
    // the block is saved here and put back on the entry's chunk in `renderChunk`.
    const fileCommentsMap = new Map<string /* filename */, t.AttachedComment[]>();
    const moduleExportsMap = new Map<string /* filename */, ModuleExports>();
    const warnedCjsDtsInputs = new Set<string>();
    // `typeof X` operands (plain identifiers) with the name they were written with. Rollup links
    // them to whatever `X` is bound to in the module, which for an import that is the imported
    // declaration — but if that declaration is only a type, `typeof X` can only have meant a
    // global value of the same name. `renderChunk` gives those back their written name.
    const typeofOperands = new WeakMap<Dependency, { moduleId: string; name: string }>();
    // Cross-module type-only propagation depends only on `moduleExportsMap`, not on
    // the chunk, so it is computed once per render and shared across all chunks
    // (reset in `renderStart` to stay correct in watch mode).
    let resolvedExportsByModule: Map<string, Map<string, boolean>> | undefined;

    return {
        generateBundle(_options, bundle) {
            // Build moduleId → chunk.fileName mapping
            const moduleToChunk = new Map<string, string>();

            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== "chunk") continue;

                for (const moduleId of chunk.moduleIds) {
                    moduleToChunk.set(moduleId, chunk.fileName);
                }
            }

            // Rewrite `declare module` placeholders to output chunk paths
            const placeholderRe = new RegExp(`"${CROSS_CHUNK_PLACEHOLDER}(.+?)"`, "g");
            // Rollup keeps the path an entry was given, but resolves imports to realpaths, so an entry
            // reached through a symlink (macOS `/tmp`) is only found by its realpath. Built on first miss.
            let moduleToChunkByRealpath: Map<string, string> | undefined;
            const findChunk = (moduleId: string): string | undefined => {
                const direct = moduleToChunk.get(moduleId);

                if (direct) return direct;

                moduleToChunkByRealpath ??= new Map(Array.from(moduleToChunk, ([id, fileName]) => [realpathOrSelf(id), fileName]));

                return moduleToChunkByRealpath.get(realpathOrSelf(moduleId));
            };

            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== "chunk" || !RE_DTS.test(chunk.fileName)) continue;

                if (!chunk.code.includes(CROSS_CHUNK_PLACEHOLDER)) continue;

                chunk.code = chunk.code.replaceAll(placeholderRe, (_match, resolvedId: string) => {
                    const targetFileName = findChunk(resolvedId);

                    if (!targetFileName) return _match;

                    let specifier = path.posix.relative(path.posix.dirname(chunk.fileName), targetFileName);

                    if (!specifier.startsWith(".")) specifier = `./${specifier}`;

                    specifier = filenameDtsTo(specifier, "js");

                    return JSON.stringify(specifier);
                });
            }

            // Rollup appends `//# sourceMappingURL=…` to every chunk once output sourcemaps are
            // on, but the `.d.ts.map` assets are deleted below when declaration maps are off —
            // leave no comment pointing at a map that does not exist.
            if (!sourcemap) {
                for (const chunk of Object.values(bundle)) {
                    if (chunk.type !== "chunk" || !RE_DTS.test(chunk.fileName)) continue;

                    chunk.code = stripTrailingSourceMappingUrl(chunk.code);
                    chunk.map = null;
                }
            }

            for (const chunk of Object.values(bundle)) {
                if (!RE_DTS_MAP.test(chunk.fileName)) continue;

                if (sourcemap) {
                    if (chunk.type === "chunk" || typeof chunk.source !== "string") continue;

                    const map = JSON.parse(chunk.source) as ExistingRawSourceMap;

                    map.sourcesContent = undefined;
                    chunk.source = JSON.stringify(map);
                } else {
                    delete bundle[chunk.fileName];
                }
            }
        },

        name: "rollup-plugin-dts:fake-js",

        outputOptions(options) {
            const { chunkFileNames, entryFileNames } = options;

            // DTS files always use ESM syntax; override cjs format to avoid invalid output
            if (options.format === "cjs" || options.format === "commonjs") {
                options = { ...options, format: "es" };
            }

            return {
                ...options,
                chunkFileNames(preRenderedChunk) {
                    let chunk = preRenderedChunk;
                    const nameTemplate = resolveTemplateFunction(chunk.isEntry ? entryFileNames || "[name].js" : chunkFileNames || "[name]-[hash].js", chunk);

                    // Rollup does not reserve the names of the declaration entries we emit, so with a
                    // template that has no `[hash]` a shared chunk could claim an entry's file name
                    // first and push the entry to `name2`. Name the shared chunk apart instead.
                    if (!chunk.isEntry && !nameTemplate.includes("[hash]") && entryChunkNames.has(chunk.name)) {
                        chunk = { ...chunk, name: chunk.name.endsWith(".d") ? `${chunk.name.slice(0, -2)}-shared.d` : `${chunk.name}-shared` };
                    }

                    if (chunk.name.endsWith(".d")) {
                        const renderedNameWithoutD = filenameJsToDts(replaceTemplateName(nameTemplate, chunk.name.slice(0, -2)));

                        if (RE_DTS.test(renderedNameWithoutD)) {
                            return renderedNameWithoutD;
                        }

                        const renderedName = filenameJsToDts(replaceTemplateName(nameTemplate, chunk.name));

                        if (RE_DTS.test(renderedName)) {
                            return renderedName;
                        }
                    }

                    return chunk === preRenderedChunk ? nameTemplate : replaceTemplateName(nameTemplate, chunk.name);
                },
                sourcemap: options.sourcemap || sourcemap,
            };
        },
        renderChunk,

        renderStart() {
            // Invalidate the per-render type-only propagation cache so watch-mode
            // rebuilds recompute it from the freshly-populated moduleExportsMap.
            resolvedExportsByModule = undefined;
            scriptOwners = undefined;
        },

        async transform(code: string, id: string) {
            if (!RE_DTS.test(id)) return;

            return transform.call(this, code, id);
        },
    };

    async function transform(this: TransformPluginContext, code: string, id: string): Promise<TransformResult> {
        const identifierMap: Record<string, number> = Object.create(null);

        let file: ParseResult;

        try {
            file = parse(code, {
                attachComments: true,
                lang: "dts",
                sourceType: "module",
            });
        } catch (error) {
            throw new Error(
                `Failed to parse ${id}. This may be caused by a syntax error in the declaration file or a bug in the plugin. Please report this issue to https://github.com/visulima/packem\n${error}`,
                { cause: error },
            );
        }

        const { program } = file;

        // CommonJS `.d.ts` inputs (`export =`, `import x = require()`) cannot be
        // reliably bundled into ESM declarations. Warn once per file so users can
        // mark the offending module as external instead of getting broken output.
        if (!warnedCjsDtsInputs.has(id) && program.body.some((node) => isCjsDtsInputSyntax(node))) {
            warnedCjsDtsInputs.add(id);
            this.warn(
                RE_NODE_MODULES.test(id)
                    ? `${id} uses CommonJS dts syntax. CommonJS dts modules cannot be reliably bundled by @visulima/rollup-plugin-dts. Please mark this module as external in your Rollup config.`
                    : `${id} uses CommonJS dts syntax. @visulima/rollup-plugin-dts does not support reliably bundling CommonJS dts input.`,
            );
        }

        // Collect export metadata up-front (before the loop below rewrites
        // `exportKind`/`importKind` to `value`) so renderChunk can later decide
        // which exports must be emitted as `export type`.
        fileCommentsMap.delete(id);
        moduleExportsMap.set(id, await collectModuleExports(this, program.body, id, collectTypeofNames(program)));

        const directives = collectReferenceDirectives(file.comments);
        const scripts: InlinableScript[] = [];

        if (directives.length > 0) {
            commentsMap.set(id, directives);

            for (const directive of directives) {
                const script = await loadReferencedScript(directive, id);

                if (script) {
                    referencedScriptMap.set(directive, script);
                    scripts.push(script);
                    // The chunk now contains this file's text, so a change to it must rebuild in watch mode.
                    this.addWatchFile(script.file);
                }
            }
        }

        if (scripts.length > 0) {
            moduleScriptsMap.set(id, scripts);
        } else {
            moduleScriptsMap.delete(id);
        }

        const exportComments = collectExportComments(program.body);

        if (exportComments.size > 0) {
            exportCommentsMap.set(id, exportComments);
        }

        const appendStatements: t.ProgramStatement[] = [];
        const namespaceStatements: NamespaceMap = new Map();
        // Track binding names to their declaration IDs for function overload merging
        const bindingToDeclarationId = new Map<string, number>();
        const statementsToRemove = new Set<number>();
        // `declare global` and `declare module "…"` augment another declaration. Nothing imports a binding
        // from them, so tree-shaking would drop the module; `moduleSideEffects` is set on the result instead.
        let hasAugmentation = false;
        // Memoize `context.resolve(source, importer)` results for `import("x").T` references
        // across every declaration in THIS module. Module-scoped + same importer, so the same
        // specifier referenced in N declarations is resolved exactly once.
        const preserveImportTypeCache = new Map<string, boolean>();

        // `import A = NS.Inner` (entity-name import-equals, not `= require(...)`) and
        // `export = NS.thing` (non-identifier export-assignment) have no JS equivalent and,
        // left raw, make rollup's parser die with cryptic `Expected ',', got '='` /
        // `Expected '{', got '='`. Normalize them up-front into a type alias / default export
        // so they flow through the normal declaration machinery below.
        for (const [i, statement] of program.body.entries()) {
            if (statement.type === "TSImportEqualsDeclaration" && statement.moduleReference.type !== "TSExternalModuleReference") {
                program.body[i] = importEqualsToTypeAlias(statement);
            } else if (
                statement.type === "ExportNamedDeclaration"
                && statement.declaration?.type === "TSImportEqualsDeclaration"
                && statement.declaration.moduleReference.type !== "TSExternalModuleReference"
            ) {
                statement.declaration = importEqualsToTypeAlias(statement.declaration);
            } else if (statement.type === "TSExportAssignment" && statement.expression.type !== "Identifier") {
                program.body[i] = b.ExportDefaultDeclaration({ declaration: statement.expression });
            }
        }

        // `export import x = require("m")` becomes an import plus a trailing `export { x }`.
        const appendedStatements: t.ProgramStatement[] = [];
        // `import x = require("m")` binds the whole module — unless "m" is written with `export =`,
        // where it binds that exported value, which is the default import in ES terms.
        const requireAsDefault = new WeakSet<t.TSImportEqualsDeclaration>();

        for (const statement of program.body) {
            const importEquals = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;

            if (
                importEquals?.type === "TSImportEqualsDeclaration"
                && importEquals.moduleReference.type === "TSExternalModuleReference"
                && (await usesExportAssignment(this, importEquals.moduleReference.expression, id))
            ) {
                requireAsDefault.add(importEquals);
            }
        }

        for (const [i, statement] of program.body.entries()) {
            const setStatement = (statement_: t.ProgramStatement) => (program.body[i] = statement_);

            // A doc block ahead of an `export … from` documents that export (restored by name via
            // `exportCommentsMap`), so on those only an explicit file tag makes it the file's.
            const fileDocComments
                = i === 0
                    ? statement.comments?.filter(
                        (comment) => isDocumentationComment(comment) && (statement.type === "ImportDeclaration" || RE_FILE_DOC_TAG.test(comment.value)),
                    )
                    : undefined;

            if (rewriteImportExport(statement, setStatement, appendedStatements, requireAsDefault)) {
                if (fileDocComments?.length) fileCommentsMap.set(id, fileDocComments);

                continue;
            }

            // `export as namespace X;` is a TypeScript UMD global declaration with no
            // JS equivalent. Strip it — leaving it in the output makes rollup's parser
            // fail on the unknown `export as` syntax.
            if (statement.type === "TSNamespaceExportDeclaration") {
                statementsToRemove.add(i);

                continue;
            }

            const isSideEffect = statement.type === "TSModuleDeclaration" && statement.kind !== "namespace";

            // Resolve local `declare module './foo'` targets so that specifiers
            // can be rewritten to point to the correct output chunk.
            let resolvedModuleId: string | undefined;

            if (isSideEffect && statement.type === "TSModuleDeclaration" && is.StringLiteral(statement.id)) {
                const resolved = await this.resolve(statement.id.value, id);

                if (resolved && !resolved.external) {
                    resolvedModuleId = RE_DTS.test(resolved.id) ? resolved.id : filenameToDts(resolved.id);
                } else if (statement.id.value[0] === ".") {
                    this.warn(
                        `\`declare module ${JSON.stringify(statement.id.value)}\` will be kept as-is in the output. Relative module declaration may cause unexpected issues. Found in ${id}.`,
                    );
                }
            }

            if (isSideEffect && id.endsWith(".vue.d.ts") && code.slice(statement.start, statement.end).includes("__VLS_")) {
                continue;
            }

            if (statement.type === "TSModuleDeclaration" && (statement.kind === "global" || is.StringLiteral(statement.id))) {
                hasAugmentation = true;
            }

            const isDefaultExport = statement.type === "ExportDefaultDeclaration";
            const isDeclaration = is.oneOf(statement, ["ExportNamedDeclaration", "ExportDefaultDeclaration"]) && !!statement.declaration;

            const declaration: t.Node = isDeclaration ? statement.declaration! : statement;
            const setDeclaration = isDeclaration
                ? (declaration: t.Declaration) => ((statement as t.ExportNamedDeclaration).declaration = declaration)
                : setStatement;

            if (declaration.type !== "TSDeclareFunction" && !is.Declaration(declaration)) {
                continue;
            }

            if (
                is.oneOf(declaration, [
                    "TSEnumDeclaration",
                    "ClassDeclaration",
                    "FunctionDeclaration",
                    "TSDeclareFunction",
                    "TSModuleDeclaration",
                    "VariableDeclaration",
                ])
            ) {
                declaration.declare = true;
            }

            const bindings: t.Identifier[] = [];

            if (declaration.type === "VariableDeclaration") {
                bindings.push(...declaration.declarations.map((declaration) => declaration.id as t.Identifier));
            } else if ("id" in declaration && declaration.id) {
                let binding: t.Node = declaration.id;

                if (binding.type === "TSQualifiedName") {
                    binding = getIdFromTSEntityName(binding);
                }

                // Only rename when the original id can't be used as a JS identifier
                // (e.g. `declare module './foo'` — a string literal). `declare global { }`
                // and `declare module Foo { }` already have valid Identifier ids and
                // must keep their names so renderChunk emits the correct keyword.
                if (isSideEffect && binding.type !== "Identifier") {
                    binding = b.Identifier({ name: `_${getIdentifierIndex(identifierMap, "")}` });
                }

                if (binding.type !== "Identifier") {
                    throw new Error(`Unexpected ${binding.type} declaration id`);
                }

                bindings.push(binding);
            } else {
                const binding = b.Identifier({ name: "export_default" });

                bindings.push(binding);
                (declaration as { id?: t.Identifier }).id = binding;
            }

            const params: TypeParams = collectParams(declaration);

            const childrenSet = new Set<t.Node>();
            const dependencies = await collectDependencies(
                this,
                declaration,
                id,
                namespaceStatements,
                childrenSet,
                identifierMap,
                preserveImportTypeCache,
                new Set(params.map(({ name }) => name)),
            );
            const children = [...childrenSet].filter((child) => bindings.every((b) => child !== b));

            if (declaration !== statement) {
                declaration.comments = statement.comments;
            }

            // Handle TypeScript declaration merging: a later declaration with the
            // same bound name (function overloads, function+namespace, class+namespace,
            // interface+const, interface+interface, ...) is attached to the primary as
            // an "overload" so we emit only one `export { X }` at the fake-JS level —
            // rollup's assertUniqueExportName rejects two exports of the same local name.
            // Both declaration bodies are still rendered in renderChunk, and TypeScript's
            // local declaration-merging rules reunite them via the single final export.
            if (bindings.length === 1 && bindingToDeclarationId.has(bindings[0].name)) {
                const existingId = bindingToDeclarationId.get(bindings[0].name)!;
                const existing = getDeclaration(existingId);

                if (!existing.overloads) {
                    existing.overloads = [];
                    existing.primaryDepsCount = existing.deps.length;
                    existing.primaryParamsCount = existing.params.length;
                    existing.primaryChildrenCount = existing.children.length;
                }

                // The overload's own name is the binding the primary already owns, so it is not a
                // child of the primary. It still needs a placeholder of its own so its span is
                // restored from the chunk like the members' spans are.
                const overloadChildren = "id" in declaration && declaration.id?.type === "Identifier" ? [declaration.id, ...children] : children;

                existing.overloads.push({
                    children: overloadChildren,
                    childrenOffset: existing.children.length,
                    decl: declaration,
                    deps: dependencies,
                    depsOffset: existing.deps.length,
                    params,
                    paramsOffset: existing.params.length,
                });
                // Merge deps, params, and children into the primary so they go through
                // Rollup's identifier renaming pipeline
                existing.deps.push(...dependencies);
                existing.params.push(...params);
                existing.children.push(...overloadChildren);
                // The runtime children array was built with the primary's children only, so the
                // overload's placeholders have to be appended for `renderChunk` to find them.
                existing.childrenNode!.elements.push(...childPlaceholders(overloadChildren));
                statementsToRemove.add(i);

                continue;
            }

            const declarationId = registerDeclaration({
                bindings,
                children,
                decl: declaration,
                deps: dependencies,
                params,
                resolvedModuleId,
            });

            // Track this binding so a subsequent declaration with the same name can be
            // merged as an overload (see the duplicate-binding branch above).
            if (bindings.length === 1) {
                bindingToDeclarationId.set(bindings[0].name, declarationId);
            }

            const declarationIdNode = numericLiteral(declarationId);
            const dependenciesNode = b.ArrowFunctionExpression({
                async: false,
                body: b.ArrayExpression({ elements: dependencies }),
                expression: true,
                generator: false,
                id: null,
                params: params.map(({ name }) => b.Identifier({ name: `${TYPE_PARAM_PREFIX}${name}` })),
            });
            const childrenNode = b.ArrayExpression({ elements: childPlaceholders(children) });

            getDeclaration(declarationId).childrenNode = childrenNode;

            const sideEffectNode =
                isSideEffect && b.CallExpression({ arguments: [bindings[0]], callee: b.Identifier({ name: "sideEffect" }), optional: false });
            const runtimeArrayNode = runtimeBindingArrayExpression(
                sideEffectNode ? [declarationIdNode, dependenciesNode, childrenNode, sideEffectNode] : [declarationIdNode, dependenciesNode, childrenNode],
            );

            // var ${binding} = [${declarationId}, (param, ...) => [dep, ...], [children], sideEffect()]
            // All bindings go into ONE declarator, destructured through an array pattern:
            //
            //   var [a, b] = [id, deps, children]
            //
            // and not `var a = [...], b`. As of rolldown 1.1.5 only the *first* declarator of a
            // `var` statement is fed through the identifier renamer, so with the multi-declarator
            // form a colliding 2nd+ binding kept its original name while the export referenced the
            // renamed one — emitting a `.d.ts` that both declares a duplicate and points at an
            // identifier that was never declared. See sxzz/rolldown-plugin-dts@30104ca.
            const runtimeAssignment = b.VariableDeclaration({
                declarations: [
                    b.VariableDeclarator({
                        id: b.ArrayPattern({
                            elements: bindings.map((binding) => {
                                return { ...binding, typeAnnotation: null };
                            }),
                        }),
                        init: runtimeArrayNode,
                    }),
                ],
                kind: "var",
            }) as RuntimeBindingVariableDeclration;

            if (isDefaultExport) {
                // export { ${binding} as default }
                appendStatements.push(exportNamedDeclaration([b.ExportSpecifier({ exported: b.Identifier({ name: "default" }), local: bindings[0] })]));
                // replace the whole statement
                setStatement(runtimeAssignment);
            } else {
                // replace declaration, keep `export`
                setDeclaration(runtimeAssignment);
            }
        }

        if (sideEffects) {
            // module side effect marker
            appendStatements.push(
                b.ExpressionStatement({
                    expression: b.CallExpression({ arguments: [], callee: b.Identifier({ name: "sideEffect" }), optional: false }),
                }),
            );
        }

        program.body = [
            ...Array.from(namespaceStatements.values(), ({ stmt }) => stmt),
            ...program.body.filter((_, index) => !statementsToRemove.has(index)),
            ...appendStatements,
            ...appendedStatements,
        ];

        const result = generate(program, {
            comments: false,
            ...(sourcemap && {
                sourceMap: { source: code, sourceFileName: id },
            }),
        });

        return {
            code: result.code,
            map: (result.map ?? null) as SourceMapInput | null,
            ...(hasAugmentation && { moduleSideEffects: true }),
        };
    }

    // The chunk that inlines each script, when several chunks reference it: the first by file name, so the choice does not
    // depend on the order rollup renders the chunks. The other chunks reference that copy instead (see `referenceOutputFile`).
    function getScriptOwners(chunks: Record<string, RenderedChunk>): Map<string, string> {
        if (scriptOwners) return scriptOwners;

        const owners = new Map<string, string>();

        for (const name of Object.keys(chunks).toSorted((a, b) => (a < b ? -1 : Number(a > b)))) {
            const { fileName, moduleIds } = chunks[name];

            // Only declaration chunks inline scripts (see `renderChunk`), so only they can own one.
            if (!RE_DTS.test(fileName)) continue;

            for (const moduleId of moduleIds) {
                for (const script of moduleScriptsMap.get(moduleId) ?? []) {
                    if (!owners.has(script.file)) owners.set(script.file, fileName);
                }
            }
        }

        scriptOwners = owners;

        return owners;
    }

    function renderChunk(code: string, chunk: RenderedChunk, options: NormalizedOutputOptions, meta: { chunks: Record<string, RenderedChunk> }) {
        if (!RE_DTS.test(chunk.fileName)) {
            return;
        }

        resolvedExportsByModule ??= resolveAllModuleExports(moduleExportsMap);

        const exportInfo = collectChunkExportInfo(chunk, moduleExportsMap, resolvedExportsByModule);

        let file: ParseResult;

        try {
            file = parse(code, {
                attachComments: true,
                lang: "ts",
                sourceType: "module",
            });
        } catch (error) {
            throw new Error(
                `Failed to parse generated code for chunk ${chunk.fileName}. This may be caused by a bug in the plugin. Please report this issue to https://github.com/visulima/packem\n${error}`,
                { cause: error },
            );
        }

        const { program } = file;

        program.body = patchTsNamespace(program.body);
        program.body = patchReExport(program.body);

        program.body = program.body
            .flatMap((node) => {
                if (isHelperImport(node)) return [];

                if (node.type === "ExpressionStatement") return [];

                const newNode = patchImportExport(node, exportInfo, cjsDefault);

                if (newNode === false) return [];

                if (newNode) return [newNode];

                if (node.type !== "VariableDeclaration") return [node];

                if (!isRuntimeBindingVariableDeclaration(node)) {
                    return [];
                }

                const [runtimeDeclarator] = node.declarations;
                const [declarationIdNode, dependenciesFunction, children] = runtimeDeclarator.init.elements;

                const declarationId = declarationIdNode.value;
                const declaration = getDeclaration(declarationId);

                if (sourcemap) {
                    // Drop the stale spans the original declaration carries: they point into
                    // the *input* `.d.ts`, and the chunk's placeholder spans (restored below)
                    // are what the output map must be built from.
                    walk(declaration.decl, {
                        enter(node) {
                            node.start = undefined as never;
                            node.end = undefined as never;
                        },
                    });
                }

                // The bindings now live as elements of the declarator's array pattern (see the
                // `runtimeAssignment` construction above), which is what rolldown has renamed.
                for (const [i, id] of runtimeDeclarator.id.elements.entries()) {
                    const transformedBinding = {
                        ...id,
                        typeAnnotation: declaration.bindings[i].typeAnnotation,
                    };

                    overwriteNode(declaration.bindings[i], transformedBinding);
                }

                const primaryChildrenCount = declaration.primaryChildrenCount ?? declaration.children.length;
                const primaryParamsCount = declaration.primaryParamsCount ?? declaration.params.length;
                const primaryDependenciesCount = declaration.primaryDepsCount ?? declaration.deps.length;

                if (sourcemap) {
                    for (let i = 0; i < primaryChildrenCount; i++) {
                        const child = (children.elements as t.StringLiteral[])[i];

                        Object.assign(declaration.children[i], {
                            end: child.end,
                            start: child.start,
                        });
                    }
                }

                const transformedParams = dependenciesFunction.params as t.Identifier[];

                for (let i = 0; i < primaryParamsCount; i++) {
                    const transformedParameter = transformedParams[i];
                    const transformedName = stripTypeParamPrefix(transformedParameter.name);

                    for (const originalTypeParameter of declaration.params[i].typeParams) {
                        originalTypeParameter.name = transformedName;
                    }
                }

                const transformedDependencies = (dependenciesFunction.body as t.ArrayExpression).elements as t.Expression[];

                for (let i = 0; i < primaryDependenciesCount; i++) {
                    const originalDependency = declaration.deps[i];
                    let transformedDependency = transformedDependencies[i];

                    if (!transformedDependency) continue;

                    if (transformedDependency.type === "UnaryExpression" && transformedDependency.operator === "void") {
                        const undefinedDependency = b.Identifier({ name: "undefined" });

                        undefinedDependency.start = transformedDependency.start;
                        undefinedDependency.end = transformedDependency.end;
                        transformedDependency = undefinedDependency;
                    } else if (isInfer(transformedDependency)) {
                        transformedDependency.name = "__Infer";
                    } else {
                        restoreTypeParamName(transformedDependency);
                    }

                    restoreGlobalTypeofName(originalDependency, transformedDependency);

                    if (originalDependency.replace) {
                        originalDependency.replace(transformedDependency);
                    } else {
                        Object.assign(originalDependency, transformedDependency);
                    }
                }

                // Rewrite local `declare module` specifier → placeholder for generateBundle
                if (declaration.decl.type === "TSModuleDeclaration" && declaration.resolvedModuleId) {
                    declaration.decl.id = stringLiteral(CROSS_CHUNK_PLACEHOLDER + declaration.resolvedModuleId);
                }

                // Restore overloaded declarations before the primary declaration
                const overloadDeclarations: t.ProgramStatement[] = [];

                if (declaration.overloads) {
                    for (const overload of declaration.overloads) {
                        if (sourcemap) {
                            walk(overload.decl, {
                                enter(node) {
                                    node.start = undefined as never;
                                    node.end = undefined as never;
                                },
                            });
                        }

                        // Use the transformed binding name from the primary declaration
                        if ("id" in overload.decl && overload.decl.id) {
                            overwriteNode(overload.decl.id, { ...declaration.bindings[0] });
                        }

                        // Patch overload children locations from the merged children array
                        if (sourcemap) {
                            for (const [i, child] of overload.children.entries()) {
                                const mergedChild = (children.elements as t.StringLiteral[])[overload.childrenOffset + i];

                                if (mergedChild) {
                                    Object.assign(child, { end: mergedChild.end, start: mergedChild.start });
                                }
                            }
                        }

                        // Patch overload type params from the merged params array
                        for (const [i, parameter] of overload.params.entries()) {
                            const mergedParameter = transformedParams[overload.paramsOffset + i];

                            if (mergedParameter) {
                                for (const typeParameter of parameter.typeParams) {
                                    typeParameter.name = stripTypeParamPrefix(mergedParameter.name);
                                }
                            }
                        }

                        // Patch overload deps from the merged deps array
                        for (const [i, originalDependency] of overload.deps.entries()) {
                            let transformedDependency = transformedDependencies[overload.depsOffset + i];

                            if (!transformedDependency) continue;

                            if (transformedDependency.type === "UnaryExpression" && transformedDependency.operator === "void") {
                                const undefinedDependency = b.Identifier({ name: "undefined" });

                                undefinedDependency.start = transformedDependency.start;
                                undefinedDependency.end = transformedDependency.end;
                                transformedDependency = undefinedDependency;
                            } else if (isInfer(transformedDependency)) {
                                transformedDependency.name = "__Infer";
                            } else {
                                restoreTypeParamName(transformedDependency);
                            }

                            restoreGlobalTypeofName(originalDependency, transformedDependency);

                            if (originalDependency.replace) {
                                originalDependency.replace(transformedDependency);
                            } else {
                                Object.assign(originalDependency, transformedDependency);
                            }
                        }

                        overloadDeclarations.push(overload.decl);
                    }
                }

                return [inheritNodeComments(node, declaration.decl), ...overloadDeclarations];
            })
            .filter((node) => !!node);

        if (program.body.length === 0) {
            return { code: "export { };", map: null };
        }

        // Ensure files with `declare module '...'` augmentations retain an `export {}`
        // so TypeScript treats them as modules. Without it, module augmentations are ignored.
        // `declare global` does NOT require this — it works in both scripts and modules.
        const hasExport = program.body.some(
            (node) => node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "ExportAllDeclaration",
        );
        const hasModuleAugmentation = program.body.some((node) => node.type === "TSModuleDeclaration" && is.StringLiteral(node.id));

        if (!hasExport && hasModuleAugmentation) {
            program.body.push(exportNamedDeclaration([]));
        }

        // recover the JSDoc of re-export statements, which never became declarations
        restoreExportComments(program.body, resolveChunkExportComments(chunk, exportCommentsMap));

        // recover the entry's own file doc comment, but not those of the modules it inlines
        const fileComments = chunk.facadeModuleId && fileCommentsMap.get(chunk.facadeModuleId);

        if (fileComments && program.body.length > 0) {
            program.body[0].comments ||= [];

            const existing = program.body[0].comments;

            program.body[0].comments.unshift(...fileComments.filter((comment) => existing.every((current) => current.value !== comment.value)));
        }

        // recover comments
        const comments = new Set<t.Comment>();
        const commentsValue = new Set<string>(); // deduplicate
        // Referenced global scripts inlined into this chunk, keyed by file so several references dedupe.
        const inlinedScripts = new Map<string, InlinableScript>();

        // Absolute directory the emitted chunk lives in, used to rebase
        // `/// <reference path="..." />` directives (see rebaseReferencePath).
        const outputDirectory = options.dir ?? (options.file ? path.dirname(options.file) : process.cwd());
        const chunkOutputDirectory = path.resolve(outputDirectory, path.dirname(chunk.fileName));

        for (const id of chunk.moduleIds) {
            const preserveComments = commentsMap.get(id);

            if (preserveComments) {
                // `path=` reference directives are relative to the SOURCE module; once hoisted
                // onto the chunk they must be rebased to the chunk's output location, otherwise
                // `path="./foo.d.ts"` points to the wrong place. `types=` directives reference
                // package names and are location-independent, so they pass through untouched.
                const sourceDirectory = path.dirname(id);

                preserveComments.forEach((c) => {
                    const script = referencedScriptMap.get(c);
                    let rebased: t.Comment;

                    if (script) {
                        const owner = getScriptOwners(meta.chunks).get(script.file);

                        if (owner === undefined || owner === chunk.fileName) {
                            inlinedScripts.set(script.file, script);

                            return;
                        }

                        // Another chunk already inlines this script, so reference its copy rather than declare it twice.
                        rebased = referenceOutputFile(c, path.resolve(outputDirectory, owner), chunkOutputDirectory);
                    } else {
                        rebased = rebaseReferencePath(c, sourceDirectory, chunkOutputDirectory);
                    }

                    const dedupeKey = rebased.type + rebased.value;

                    if (commentsValue.has(dedupeKey)) return;

                    commentsValue.add(dedupeKey);
                    comments.add(rebased);
                });
                commentsMap.delete(id);
            }
        }

        if (comments.size > 0) {
            program.body[0].comments ||= [];
            program.body[0].comments.unshift(
                ...Array.from(comments, (c): t.AttachedComment => {
                    return {
                        position: "before",
                        sameLine: false,
                        type: c.type,
                        value: c.value,
                    };
                }),
            );
        }

        appendInlinedScripts(program, [...inlinedScripts.values()], sourcemap);

        const result = generate(program, {
            comments: true,
            ...(sourcemap && {
                sourceMap: { source: code, sourceFileName: chunk.fileName },
            }),
        });

        return {
            code: result.code,
            map: (result.map ?? null) as SourceMapInput | null,
        };
    }

    function restoreGlobalTypeofName(original: Dependency, transformed: t.Node): void {
        const operand = typeofOperands.get(original);

        if (!operand || transformed.type !== "Identifier" || transformed.name === operand.name) return;

        const imported = moduleExportsMap.get(operand.moduleId)?.imports.get(operand.name);

        if (imported?.source && resolveExportMeaning(moduleExportsMap, imported.source, imported.imported, new Set()) === "type") {
            transformed.name = operand.name;
        }
    }

    function getIdentifierIndex(identifierMap: Record<string, number>, name: string) {
        if (name in identifierMap) {
            return identifierMap[name]++;
        }

        return (identifierMap[name] = 0);
    }

    function registerDeclaration(info: DeclarationInfo) {
        const declarationId = declarationIndex++;

        declarationMap.set(declarationId, info);

        return declarationId;
    }

    function getDeclaration(declarationId: number) {
        return declarationMap.get(declarationId)!;
    }

    /**
     * Collects all TSTypeParameter nodes from the given node and groups them by
     * their name. One name can associate with one or more type parameters. These
     * names will be used as the parameter name in the generated JavaScript
     * dependency function.
     *
     * The collected nodes are the type parameters' *name* Identifiers, which are
     * mutated in place in renderChunk so the renamed binding keeps its span.
     */
    function collectParams(node: t.Node): TypeParams {
        const typeParams: t.Identifier[] = [];

        walk(node, {
            leave(node) {
                if ("typeParameters" in node && (node.typeParameters as t.TSTypeParameterDeclaration | null)?.type === "TSTypeParameterDeclaration") {
                    typeParams.push(...(node.typeParameters as t.TSTypeParameterDeclaration).params.map(({ name }) => name));
                }
            },
        });

        const parameterMap = new Map<string, t.Identifier[]>();

        for (const typeParameter of typeParams) {
            const { name } = typeParameter;
            const group = parameterMap.get(name);

            if (group) {
                group.push(typeParameter);
            } else {
                parameterMap.set(name, [typeParameter]);
            }
        }

        return Array.from(parameterMap, ([name, typeParams]) => {
            return {
                name,
                typeParams,
            };
        });
    }

    function collectInferredNames(node: t.Node): string[] {
        const inferred: string[] = [];

        walk(node, {
            enter(node) {
                if (node.type === "TSInferType" && node.typeParameter) {
                    inferred.push(node.typeParameter.name.name);
                }
            },
        });

        return inferred;
    }

    async function collectDependencies(
        context: TransformPluginContext,
        node: t.Node,
        importer: string,
        namespaceStatements: NamespaceMap,
        children: Set<t.Node>,
        identifierMap: Record<string, number>,
        // Module-scoped cache (keyed by import specifier, shared across all declarations of the
        // same module/importer) so `context.resolve` for `import("x").T` runs once per specifier.
        preserveImportTypeCache: Map<string, boolean>,
        typeParamNames: Set<string>,
    ): Promise<Dependency[]> {
        const dependencies = new Set<Dependency>();
        const seen = new Set<t.Node>();

        // yuku's `walk` is synchronous, so every `import("x")` specifier is collected in a
        // first pass, resolved in parallel into `preserveImportTypeCache`, and only then read
        // back — synchronously — by the dependency-collecting walk below.
        const importSources = new Set<string>();

        walk(node, {
            TSImportType(node) {
                if (!preserveImportTypeCache.has(node.source.value)) {
                    importSources.add(node.source.value);
                }
            },
        });

        if (importSources.size > 0) {
            await Promise.all(
                Array.from(importSources, async (source) => {
                    const resolved = await context.resolve(source, importer);

                    preserveImportTypeCache.set(source, !resolved || Boolean(resolved.external));
                }),
            );
        }

        const inferredStack: string[][] = [];
        let currentInferred = new Set<string>();

        function isInferred(node: t.Node): boolean {
            return node.type === "Identifier" && currentInferred.has(node.name);
        }

        walk(node, {
            enter(node) {
                if (node.type !== "TSConditionalType") {
                    return;
                }

                const inferred = collectInferredNames(node.extendsType);

                inferredStack.push(inferred);
            },
            leave(node, context) {
                const { parent } = context;

                if (node.type === "TSConditionalType") {
                    inferredStack.pop();
                } else if (parent?.type === "TSConditionalType") {
                    const isTrueBranch = parent.trueType === node;

                    currentInferred = new Set<string>((isTrueBranch ? inferredStack : inferredStack.slice(0, -1)).flat());
                } else {
                    currentInferred = new Set<string>();
                }

                if (node.type === "ExportNamedDeclaration") {
                    for (const specifier of node.specifiers) {
                        if (specifier.type === "ExportSpecifier") {
                            addDependency(specifier.local);
                        }
                    }
                } else if (node.type === "TSInterfaceDeclaration" && node.extends) {
                    for (const heritage of node.extends || []) {
                        addDependency(heritage.expression);
                    }
                } else if (node.type === "ClassDeclaration") {
                    if (node.superClass) addDependency(node.superClass);

                    if (node.implements) {
                        for (const implement of node.implements) {
                            addDependency(implement.expression);
                        }
                    }
                } else if (
                    is.oneOf(node, [
                        "Property",
                        "PropertyDefinition",
                        "TSAbstractPropertyDefinition",
                        "MethodDefinition",
                        "TSAbstractMethodDefinition",
                        "TSPropertySignature",
                        "TSMethodSignature",
                    ])
                ) {
                    if (node.computed && isReferenceId(node.key)) {
                        addDependency(node.key);
                    }

                    if ("value" in node && isReferenceId(node.value)) {
                        addDependency(node.value);
                    }
                } else {
                    switch (node.type) {
                        case "TSImportType": {
                            seen.add(node);

                            const { qualifier, source } = node;
                            const dependency = importNamespace(node, qualifier, source, namespaceStatements, identifierMap, preserveImportTypeCache);

                            if (dependency) addDependency(dependency);

                            break;
                        }
                        case "TSTypeQuery": {
                            if (seen.has(node.exprName)) return;

                            if (node.exprName.type === "TSImportType") break;

                            const operand = TSEntityNameToRuntime(node.exprName);

                            if (operand.type === "Identifier" && !typeParamNames.has(operand.name)) {
                                typeofOperands.set(operand, { moduleId: importer, name: operand.name });
                            }

                            addDependency(operand);

                            break;
                        }
                        case "TSTypeReference": {
                            const reference = TSEntityNameToRuntime(node.typeName);

                            // Only a bare identifier reference can name a type parameter; as the left
                            // of a qualified name, a `typeof` operand or an import type it resolves
                            // in the namespace/value meaning instead. `isInferred` compares by name,
                            // so it has to run before the rename.
                            if (reference.type === "Identifier" && !isInferred(reference) && typeParamNames.has(reference.name)) {
                                reference.name = `${TYPE_PARAM_PREFIX}${reference.name}`;
                            }

                            addDependency(reference);

                            break;
                        }
                    }
                }

                if (parent && !dependencies.has(node as Dependency) && isChildSymbol(node, parent)) {
                    children.add(node);
                }
            },
        });

        return [...dependencies];

        function addDependency(node: Dependency) {
            if (isThisExpression(node) || isInferred(node)) return;

            dependencies.add(node);
        }
    }

    function importNamespace(
        node: t.TSImportType,
        imported: t.TSImportTypeQualifier | null | undefined,
        source: t.StringLiteral,
        namespaceStatements: NamespaceMap,
        identifierMap: Record<string, number>,
        preserveCache: Map<string, boolean>,
    ): Dependency | undefined {
        // Inline `import("pkg").Type` references to external (or unresolvable)
        // modules must be preserved as-is. Converting them into a hoisted
        // `import * as _ from "pkg"` namespace would inline the external types and
        // break declarations that intentionally reference an external package.
        const isPreserve = preserveCache.get(source.value) ?? true;

        if (isPreserve) {
            return undefined;
        }

        const sourceText = source.value.replaceAll(/\W/g, "_");
        const localName = `_$${isIdentifierName(source.value) ? source.value : `${sourceText}${getIdentifierIndex(identifierMap, sourceText)}`}`;
        let local: t.Identifier | t.TSQualifiedName = b.Identifier({ name: localName });

        if (namespaceStatements.has(source.value)) {
            local = namespaceStatements.get(source.value)!.local;
        } else {
            // prepend: import * as ${local} from ${source}
            namespaceStatements.set(source.value, {
                local,
                stmt: b.ImportDeclaration({
                    attributes: [],
                    phase: null,
                    source,
                    specifiers: [b.ImportNamespaceSpecifier({ local })],
                }),
            });
        }

        if (imported) {
            const importedLeft = getIdFromTSEntityName(imported);

            if (importedLeft.type === "ThisExpression") {
                throw new Error("Cannot import `this` from module.");
            }

            overwriteNode(importedLeft, b.TSQualifiedName({ left: local, right: { ...importedLeft } }));
            local = imported;
        }

        let replacement: t.Node = node;

        if (node.typeArguments) {
            overwriteNode(node, b.TSTypeReference({ typeArguments: node.typeArguments, typeName: local }));
            replacement = local;
        } else {
            overwriteNode(node, local);
        }

        const dependency: Dependency = {
            ...TSEntityNameToRuntime(local),
            replace(newNode) {
                overwriteNode(replacement, newNode);
            },
        };

        return dependency;
    }
};

function isChildSymbol(node: t.Node, parent: t.Node): boolean {
    if (node.type === "Identifier") return true;

    if (is.oneOf(parent, ["TSPropertySignature", "TSMethodSignature"]) && parent.key === node) return true;

    return false;
}

const REFERENCE_RE = /\/\s*<reference\s+(?:path|types)=/;

const collectReferenceDirectives = (comment: t.Comment[], negative = false) => comment.filter((c) => REFERENCE_RE.test(c.value) !== negative);

// `//# sourceMappingURL=` / `//# sourceURL=` pragmas attached to a source node must not be
// carried over onto the rendered chunk — rollup emits its own pragma for the output map.
const SOURCE_MAP_PRAGMA_RE = /^#\s*source(?:Mapping)?URL=/;

const isSourceMapPragma = (comment: { value: string }): boolean => SOURCE_MAP_PRAGMA_RE.test(comment.value);

// Matches the `path="..."` (or single-quoted) attribute of a triple-slash reference directive.
const REFERENCE_PATH_RE = /(\/\s*<reference\s+path=)(["'])(.+?)\2/;

// Rebase a `/// <reference path="./foo.d.ts" />` directive so its relative path — originally
// correct relative to `sourceDirectory` — is correct relative to `chunkOutputDirectory` where
// the comment is being hoisted. `types=` directives reference package names (not file paths)
// and are returned untouched. Absolute paths are also left as-is.
// A directive that references another output file, with the path relative to the chunk's own directory.
const referenceOutputFile = (comment: t.Comment, targetFile: string, chunkOutputDirectory: string): t.Comment => {
    let relative = path.relative(chunkOutputDirectory, targetFile).replaceAll("\\", "/");

    if (!relative.startsWith(".")) {
        relative = `./${relative}`;
    }

    return { ...comment, value: `/ <reference path="${relative}" />` };
};

const rebaseReferencePath = (comment: t.Comment, sourceDirectory: string, chunkOutputDirectory: string): t.Comment => {
    const match = REFERENCE_PATH_RE.exec(comment.value);

    if (!match) {
        return comment;
    }

    const [, prefix, quote, referencePath] = match;

    if (path.isAbsolute(referencePath)) {
        return comment;
    }

    const absoluteTarget = path.resolve(sourceDirectory, referencePath);
    let rebased = path.relative(chunkOutputDirectory, absoluteTarget).replaceAll("\\", "/");

    if (!rebased.startsWith(".")) {
        rebased = `./${rebased}`;
    }

    if (rebased === referencePath) {
        return comment;
    }

    // Return a fresh comment node so we don't mutate the cached entry shared across renders.
    return { ...comment, value: comment.value.replace(REFERENCE_PATH_RE, `${prefix}${quote}${rebased}${quote}`) };
};

// #region Re-export JSDoc

/**
 * Leading JSDoc recovered for a single exported name, keyed by that name.
 */
type ExportComments = Map<string /* exported name */, t.AttachedComment[]>;

const isDocumentationComment = (comment: t.AttachedComment): boolean =>
    comment.position === "before"
    && comment.type === "Block"
    && comment.value.startsWith("*")
    && !REFERENCE_RE.test(comment.value)
    && !isSourceMapPragma(comment);

/**
 * The JSDoc block TypeScript associates with a node is the *nearest* preceding one — an
 * earlier license banner or `@packageDocumentation` block does not document the statement
 * that happens to follow it. Mirror that rule so only the doc comment a user actually wrote
 * for the export is carried over.
 */
const nearestDocumentationComment = (comments: t.AttachedComment[] | undefined): t.AttachedComment | undefined =>
    comments?.findLast((comment) => isDocumentationComment(comment));

/**
 * Collect the leading JSDoc of specifier-based export statements (`export { x } from "…"`,
 * `export type { T } from "…"`, `export { x }`, `export * as ns from "…"`) keyed by the
 * name each comment documents.
 *
 * These statements are the only ones the transform pass hands to rollup verbatim: they are
 * never rewritten into the sentinel `var [x] = [...]` form, so — unlike declarations, whose
 * nodes are stashed in `declarationMap` and reprinted with `comments: true` in `renderChunk`
 * — their comments would be lost to the `comments: false` print at the end of `transform`.
 * `renderChunk` re-attaches them by name (see `restoreExportComments`).
 */
const collectExportComments = (nodes: t.ProgramStatement[]): ExportComments => {
    const result: ExportComments = new Map();

    const add = (name: string | undefined | null, comment: t.AttachedComment | undefined) => {
        if (!name || !comment) {
            return;
        }

        const existing = result.get(name);

        if (existing) {
            if (existing.every((previous) => previous.value !== comment.value)) {
                existing.push(comment);
            }

            return;
        }

        result.set(name, [comment]);
    };

    for (const node of nodes) {
        // `export * as ns from "…"` documents exactly one name; `export * from "…"` documents
        // none, so there is nothing a comment could be re-attached to.
        if (node.type === "ExportAllDeclaration") {
            add(node.exported && nameOf(node.exported), nearestDocumentationComment(node.comments));

            continue;
        }

        if (node.type !== "ExportNamedDeclaration" || node.declaration) {
            continue;
        }

        const statementComment = nearestDocumentationComment(node.comments);

        for (const specifier of node.specifiers) {
            if (specifier.type !== "ExportSpecifier") {
                continue;
            }

            const name = nameOf(specifier.exported);

            add(name, statementComment);
            add(name, nearestDocumentationComment(specifier.comments));
        }
    }

    return result;
};

const sameComments = (a: t.AttachedComment[], b: t.AttachedComment[]): boolean =>
    a.length === b.length && a.every((comment, index) => comment.value === b[index].value);

/**
 * Merge the per-module maps of every module in `chunk` into one lookup keyed by exported name.
 *
 * The rendered chunk gives us no export → module attribution, so the exported name is the only
 * handle left after rollup has merged, inlined and renamed the original statements. The facade
 * (entry) module owns the chunk's public surface, so its annotations win outright; a name that
 * two non-facade modules document differently is ambiguous and mapped to `undefined` so that
 * `restoreExportComments` leaves it alone rather than guessing.
 */
const resolveChunkExportComments = (chunk: RenderedChunk, exportCommentsMap: Map<string, ExportComments>): Map<string, t.AttachedComment[] | undefined> => {
    const resolved = new Map<string, t.AttachedComment[] | undefined>();
    const { facadeModuleId } = chunk;
    const moduleIds =
        facadeModuleId && chunk.moduleIds.includes(facadeModuleId)
            ? [facadeModuleId, ...chunk.moduleIds.filter((moduleId) => moduleId !== facadeModuleId)]
            : chunk.moduleIds;
    const fromFacade = new Set<string>();

    for (const moduleId of moduleIds) {
        const moduleComments = exportCommentsMap.get(moduleId);

        if (!moduleComments) {
            continue;
        }

        for (const [name, comments] of moduleComments) {
            if (fromFacade.has(name)) {
                continue;
            }

            if (moduleId === facadeModuleId) {
                fromFacade.add(name);
                resolved.set(name, comments);

                continue;
            }

            const existing = resolved.get(name);

            if (!resolved.has(name)) {
                resolved.set(name, comments);
            } else if (!existing || !sameComments(existing, comments)) {
                resolved.set(name, undefined);
            }
        }
    }

    return resolved;
};

/**
 * Re-attach the JSDoc collected by {@link collectExportComments} to the rendered chunk.
 *
 * Comments always land on the *specifier*, never on the statement, even when the original
 * statement had a single member: TypeScript only honours JSDoc written inside the braces of an
 * `export { … } from "…"` — a leading block on the statement itself is ignored — and rollup is
 * free to merge same-source re-exports into one statement, which would smear a statement-level
 * comment across unrelated members.
 */
const restoreExportComments = (nodes: t.ProgramStatement[], commentsByName: Map<string, t.AttachedComment[] | undefined>): void => {
    if (commentsByName.size === 0) {
        return;
    }

    const attach = (target: { comments?: t.AttachedComment[] }, name: string | undefined | null) => {
        if (!name) {
            return;
        }

        const comments = commentsByName.get(name);

        if (!comments) {
            return;
        }

        // A comment the chunk already carries came through rollup untouched and wins.
        if (target.comments?.some((comment) => isDocumentationComment(comment))) {
            return;
        }

        target.comments = [...comments, ...(target.comments ?? [])];
    };

    for (const node of nodes) {
        if (node.type === "ExportAllDeclaration") {
            attach(node, node.exported && nameOf(node.exported));

            continue;
        }

        if (node.type !== "ExportNamedDeclaration" || node.declaration) {
            continue;
        }

        for (const specifier of node.specifiers) {
            if (specifier.type === "ExportSpecifier") {
                attach(specifier, nameOf(specifier.exported));
            }
        }
    }
};

// #endregion

// CommonJS declaration syntax (`export = X`, `import X = require("y")`) cannot be
// represented in a bundled ESM `.d.ts`. Used to emit a one-time warning per input.
const isCjsDtsInputSyntax = (node: t.ProgramStatement): boolean =>
    node.type === "TSExportAssignment" || (node.type === "TSImportEqualsDeclaration" && node.moduleReference.type === "TSExternalModuleReference");

// #region Export metadata

const collectTypeOnlyLocals = (node: t.ProgramStatement, typeOnlyLocals: Set<string>): void => {
    if (node.type !== "ImportDeclaration") {
        return;
    }

    for (const specifier of node.specifiers) {
        if (node.importKind === "type" || ("importKind" in specifier && specifier.importKind === "type")) {
            typeOnlyLocals.add(specifier.local.name);
        }
    }
};

// Walks a binding pattern (array / object / rest / default) and returns the bound names.
const collectPatternNames = (node: t.Node | null | undefined): string[] => {
    if (!node) {
        return [];
    }

    if (node.type === "Identifier") {
        return [node.name];
    }

    if (node.type === "RestElement") {
        return collectPatternNames(node.argument);
    }

    if (node.type === "AssignmentPattern") {
        return collectPatternNames(node.left);
    }

    if (node.type === "ArrayPattern") {
        return node.elements.flatMap((element) => collectPatternNames(element));
    }

    if (node.type === "ObjectPattern") {
        return node.properties.flatMap((property) => {
            if (property.type === "RestElement") {
                return collectPatternNames(property.argument);
            }

            return collectPatternNames(property.value);
        });
    }

    return [];
};

const collectDeclarationNames = (node: t.Node): string[] => {
    if (node.type === "VariableDeclaration") {
        return node.declarations.flatMap((declaration) => collectPatternNames(declaration.id));
    }

    if ("id" in node && node.id) {
        const nodeId = node.id as t.Node;

        if (nodeId.type !== "Identifier" && nodeId.type !== "TSQualifiedName") {
            return [];
        }

        const id = getIdFromTSEntityName(nodeId);

        return id.type === "Identifier" ? [id.name] : [];
    }

    return [];
};

const isTypeOnlyExport = (node: t.ExportNamedDeclaration, specifier: t.ExportSpecifier): boolean =>
    node.exportKind === "type" || specifier.exportKind === "type";

const RE_EXPORT_ASSIGNMENT = /^[\t ]*export[\t ]*=/m;

/** Whether a local module that `source` points at is written with `export =`. */
const usesExportAssignment = async (context: TransformPluginContext, source: t.StringLiteral, importer: string): Promise<boolean> => {
    const target = await resolveExportSource(context, source, importer);

    if (!target) return false;

    try {
        return RE_EXPORT_ASSIGNMENT.test(await readFile(target, "utf8"));
    } catch {
        return false;
    }
};

const resolveExportSource = async (
    context: TransformPluginContext,
    source: t.StringLiteral | null | undefined,
    importer: string,
): Promise<string | undefined> => {
    if (!source) {
        return undefined;
    }

    const resolved = await context.resolve(source.value, importer);

    if (!resolved || resolved.external) {
        return undefined;
    }

    return resolved.id;
};

const collectExportInfo = async (context: TransformPluginContext, node: t.ProgramStatement, id: string, info: ModuleExports): Promise<void> => {
    if (node.type === "ExportNamedDeclaration") {
        if (node.declaration) {
            for (const name of collectDeclarationNames(node.declaration)) {
                info.exports.set(name, false);
            }

            return;
        }

        const source = await resolveExportSource(context, node.source, id);

        for (const specifier of node.specifiers) {
            const isTypeOnly = isTypeOnlyExport(node, specifier);
            const exported = nameOf(specifier.exported);
            const local = nameOf(specifier.local);

            if (source) {
                info.reExports.push({ exported, local, source, typeOnly: isTypeOnly });
            } else {
                info.exports.set(exported, isTypeOnly || info.typeOnlyLocals.has(local));
            }
        }

        return;
    }

    if (node.type === "ExportDefaultDeclaration") {
        info.exports.set("default", false);

        return;
    }

    if (node.type === "ExportAllDeclaration") {
        // `export * as ns from "..."` is a named export of the namespace object, not a
        // star re-export (babel modelled this as an ExportNamespaceSpecifier instead).
        if (node.exported) {
            info.exports.set(nameOf(node.exported), node.exportKind === "type");

            return;
        }

        info.exportAlls.push({
            rawSource: node.source.value,
            source: await resolveExportSource(context, node.source, id),
            typeOnly: node.exportKind === "type",
        });
    }
};

const declarationMeaning = (node: t.Node): DeclarationMeaning | undefined => {
    switch (node.type) {
        case "ClassDeclaration":
        case "TSEnumDeclaration":
        case "TSModuleDeclaration": {
            return "both";
        }
        case "FunctionDeclaration":
        case "TSDeclareFunction":
        case "VariableDeclaration": {
            return "value";
        }
        case "TSInterfaceDeclaration":
        case "TSTypeAliasDeclaration": {
            return "type";
        }
        default: {
            return undefined;
        }
    }
};

/** Records what the top level binds: declarations with their meaning, imports, and local exports. */
const collectBindings = async (context: TransformPluginContext, node: t.ProgramStatement, id: string, info: ModuleExports, typeofNames: Set<string>): Promise<void> => {
    if (node.type === "ImportDeclaration") {
        // Only imports used as a `typeof` operand are ever looked up again, so only those pay for a resolve.
        if (node.specifiers.every((specifier) => !typeofNames.has(specifier.local.name))) return;

        const source = await resolveExportSource(context, node.source, id);

        for (const specifier of node.specifiers) {
            if (specifier.type === "ImportSpecifier") {
                info.imports.set(specifier.local.name, { imported: nameOf(specifier.imported), source });
            } else if (specifier.type === "ImportDefaultSpecifier") {
                info.imports.set(specifier.local.name, { imported: "default", source });
            }
        }

        return;
    }

    const declaration = node.type === "ExportNamedDeclaration" ? node.declaration : node;

    if (declaration) {
        const meaning = declarationMeaning(declaration);

        if (meaning) {
            for (const name of collectDeclarationNames(declaration)) {
                const previous = info.declared.get(name);

                info.declared.set(name, previous && previous !== meaning ? "both" : meaning);

                if (node.type === "ExportNamedDeclaration") info.exportLocals.set(name, name);
            }
        }

        return;
    }

    if (node.type === "ExportNamedDeclaration" && !node.source) {
        for (const specifier of node.specifiers) {
            info.exportLocals.set(nameOf(specifier.exported), nameOf(specifier.local));
        }
    }
};

/**
 * What an exported name means in a module, followed through local bindings, imports and
 * re-exports. `undefined` when it cannot be told (external module, namespace, cycle), which
 * callers must treat as "possibly anything".
 */
const resolveExportMeaning = (moduleExportsMap: Map<string, ModuleExports>, moduleId: string, name: string, visited: Set<string>): DeclarationMeaning | undefined => {
    const key = `${moduleId}\0${name}`;
    const info = moduleExportsMap.get(moduleId);

    if (!info || visited.has(key)) return undefined;

    visited.add(key);

    const local = info.exportLocals.get(name);

    if (local) {
        const declared = info.declared.get(local);

        if (declared) return declared;

        const imported = info.imports.get(local);

        return imported?.source ? resolveExportMeaning(moduleExportsMap, imported.source, imported.imported, visited) : undefined;
    }

    const reExport = info.reExports.find((candidate) => candidate.exported === name && candidate.source);

    if (reExport?.source) return resolveExportMeaning(moduleExportsMap, reExport.source, reExport.local, visited);

    if (name !== "default") {
        for (const exportAll of info.exportAlls) {
            const meaning = exportAll.source ? resolveExportMeaning(moduleExportsMap, exportAll.source, name, visited) : undefined;

            if (meaning) return meaning;
        }
    }

    return undefined;
};

/** Names used as a bare `typeof X` operand anywhere in the module. */
const collectTypeofNames = (program: t.Program): Set<string> => {
    const names = new Set<string>();

    walk(program, {
        TSTypeQuery(node) {
            if (node.exprName.type === "Identifier") names.add(node.exprName.name);
        },
    });

    return names;
};

const collectModuleExports = async (context: TransformPluginContext, nodes: t.ProgramStatement[], id: string, typeofNames: Set<string>): Promise<ModuleExports> => {
    const info: ModuleExports = {
        declared: new Map(),
        exportAlls: [],
        exportLocals: new Map(),
        exports: new Map(),
        imports: new Map(),
        reExports: [],
        typeOnlyLocals: new Set(),
    };

    for (const node of nodes) {
        collectTypeOnlyLocals(node, info.typeOnlyLocals);
        await collectBindings(context, node, id, info, typeofNames);
    }

    for (const node of nodes) {
        await collectExportInfo(context, node, id, info);
    }

    return info;
};

// Merge a name's type-only flag into an exports map. A value export (`false`)
// always wins over a type-only one. Returns `true` when the map changed, so the
// fixpoint loop in `resolveAllModuleExports` knows whether to iterate again.
const setExportTypeOnly = (target: Map<string, boolean>, name: string, typeOnly: boolean): boolean => {
    const current = target.get(name);

    if (current === false || current === typeOnly) {
        return false;
    }

    if (current === undefined || !typeOnly) {
        target.set(name, typeOnly);

        return true;
    }

    return false;
};

const exportsEqual = (a: Map<string, boolean>, b: Map<string, boolean>): boolean => {
    if (a.size !== b.size) {
        return false;
    }

    for (const [key, value] of a) {
        if (b.get(key) !== value) {
            return false;
        }
    }

    return true;
};

// Propagate type-only-ness across re-exports (`export { X } from`) and
// `export *` chains until a fixpoint is reached, so a name that is type-only at
// its origin stays type-only through every barrel that re-exports it.
//
// Each pass recomputes a module's exports from scratch (its genuine direct
// exports plus the *current* propagated values of its sources) rather than
// mutating an accumulator in place. The in-place approach was order-dependent:
// a re-export whose source had not been resolved yet would be seeded as a value
// export and then locked there, because `setExportTypeOnly` never upgrades
// `false → true`. Recomputing lets the value settle correctly regardless of the
// order modules are visited, while still letting a genuine value export win.
const resolveAllModuleExports = (moduleExportsMap: Map<string, ModuleExports>): Map<string, Map<string, boolean>> => {
    const exportsByModule = new Map<string, Map<string, boolean>>();

    for (const [id, info] of moduleExportsMap) {
        exportsByModule.set(id, new Map(info.exports));
    }

    let isChanged = true;

    while (isChanged) {
        isChanged = false;

        for (const [id, info] of moduleExportsMap) {
            // Start from the module's genuine direct exports each pass so a
            // re-export's flag can be revised upward as its source resolves.
            const next = new Map(info.exports);

            for (const reExport of info.reExports) {
                const sourceExports = reExport.source ? exportsByModule.get(reExport.source) : undefined;
                const isSourceTypeOnly = sourceExports?.get(reExport.local) ?? false;

                setExportTypeOnly(next, reExport.exported, reExport.typeOnly || isSourceTypeOnly);
            }

            for (const exportAll of info.exportAlls) {
                if (!exportAll.source) {
                    continue;
                }

                const sourceExports = exportsByModule.get(exportAll.source);

                if (!sourceExports) {
                    continue;
                }

                for (const [name, typeOnly] of sourceExports) {
                    if (name === "default") {
                        continue;
                    }

                    setExportTypeOnly(next, name, exportAll.typeOnly || typeOnly);
                }
            }

            if (!exportsEqual(exportsByModule.get(id)!, next)) {
                exportsByModule.set(id, next);
                isChanged = true;
            }
        }
    }

    return exportsByModule;
};

const collectChunkExportInfo = (
    chunk: RenderedChunk,
    moduleExportsMap: Map<string, ModuleExports>,
    exportsByModule: Map<string, Map<string, boolean>>,
): ChunkExportInfo => {
    const roots = chunk.facadeModuleId && moduleExportsMap.has(chunk.facadeModuleId) ? [chunk.facadeModuleId] : chunk.moduleIds;
    const mergedExports = new Map<string, boolean>();
    const typeOnlyExportAllSources = new Set<string>();

    for (const root of roots) {
        const rootExports = exportsByModule.get(root);

        if (rootExports) {
            for (const [name, typeOnly] of rootExports) {
                setExportTypeOnly(mergedExports, name, typeOnly);
            }
        }

        const moduleExports = moduleExportsMap.get(root);

        if (!moduleExports) {
            continue;
        }

        for (const exportAll of moduleExports.exportAlls) {
            if (!exportAll.typeOnly || exportAll.source) {
                continue;
            }

            typeOnlyExportAllSources.add(exportAll.rawSource);
        }
    }

    const typeOnlyNames = new Set<string>();

    for (const [name, typeOnly] of mergedExports) {
        if (typeOnly) {
            typeOnlyNames.add(name);
        }
    }

    return { typeOnlyExportAllSources, typeOnlyNames };
};

// Collapse `export { type A, type B }` into `export type { A, B }` when every
// specifier is type-only — the canonical form TypeScript emits.
const normalizeTypeOnlyExport = (node: t.ExportNamedDeclaration): void => {
    if (node.declaration || node.specifiers.length === 0) {
        return;
    }

    for (const specifier of node.specifiers) {
        if (specifier.type !== "ExportSpecifier" || specifier.exportKind !== "type") {
            return;
        }
    }

    node.exportKind = "type";

    for (const specifier of node.specifiers) {
        if (specifier.type === "ExportSpecifier") {
            specifier.exportKind = "value";
        }
    }
};

// #endregion

// #region Runtime binding variable

/**
 * A variable declaration that declares a runtime binding variable. It represents a declaration like:
 *
 * ```js
 * var binding = [declarationId, (param, ...) => [dep, ...], [children], sideEffect()]
 * ```
 *
 * For an more concrete example, the following TypeScript declaration:
 *
 * ```ts
 * interface Bar extends Foo { bar: number }
 * ```
 *
 * Will be transformed to the following JavaScript code:
 *
 * ```js
 * const Bar = [123, () => [Foo], []]
 * ```
 *
 * Which will be represented by this type.
 */
// `var [binding, ...] = [declarationId, deps, children]` — a single declarator whose id is an
// array pattern holding every binding, so all of them pass through rolldown's renamer.
type RuntimeBindingVariableDeclration = t.VariableDeclaration & {
    declarations: [t.VariableDeclarator & { id: t.ArrayPattern & { elements: t.Identifier[] }; init: RuntimeBindingArrayExpression }];
};

/**
 * Check if the given node is a {@link RuntimeBindingVariableDeclration}
 */
const isRuntimeBindingVariableDeclaration = (node: t.Node | null | undefined): node is RuntimeBindingVariableDeclration =>
    node?.type === "VariableDeclaration"
    && node.declarations.length > 0
    && node.declarations[0].type === "VariableDeclarator"
    && node.declarations[0].id.type === "ArrayPattern"
    && isRuntimeBindingArrayExpression(node.declarations[0].init);

/**
 * A array expression that contains {@link RuntimeBindingArrayElements}
 *
 * It can be used to represent the following JavaScript code:
 *
 * ```js
 * [declarationId, (param, ...) => [dep, ...], [children], sideEffect()]
 * ```
 */
type RuntimeBindingArrayExpression = t.ArrayExpression & {
    elements: RuntimeBindingArrayElements;
};

/**
 * Check if the given node is a {@link RuntimeBindingArrayExpression}
 */
const isRuntimeBindingArrayExpression = (node: t.Node | null | undefined): node is RuntimeBindingArrayExpression =>
    node?.type === "ArrayExpression" && isRuntimeBindingArrayElements(node.elements);

const runtimeBindingArrayExpression = (elements: RuntimeBindingArrayElements): RuntimeBindingArrayExpression =>
    b.ArrayExpression({ elements: [...elements] }) as RuntimeBindingArrayExpression;

type RuntimeBindingArrayElementsBase = [declarationId: t.NumericLiteral, deps: t.ArrowFunctionExpression, children: t.ArrayExpression];

/**
 * An array that represents the elements in {@link RuntimeBindingArrayExpression}
 */
type RuntimeBindingArrayElements =
    RuntimeBindingArrayElementsBase | [declarationId: t.NumericLiteral, deps: t.ArrowFunctionExpression, children: t.ArrayExpression, effect: t.CallExpression];

/**
 * Check if the given array is a {@link RuntimeBindingArrayElements}
 */
const isRuntimeBindingArrayElements = (elements: (t.Node | null | undefined)[]): elements is RuntimeBindingArrayElements => {
    const [declarationId, dependencies, children, effect] = elements;

    return (
        is.NumericLiteral(declarationId)
        && dependencies?.type === "ArrowFunctionExpression"
        && children?.type === "ArrayExpression"
        && (!effect || effect.type === "CallExpression")
    );
};

// #endregion

const isInfer = (node: t.Node): node is t.Identifier => is.Identifier(node, "infer");

const isThisExpression = (node: t.Node): boolean =>
    is.Identifier(node, "this") || node.type === "ThisExpression" || (node.type === "MemberExpression" && isThisExpression(node.object));

const TSEntityNameToRuntime = (node: t.TSTypeName): t.Identifier | t.MemberExpression | t.ThisExpression => {
    if (node.type === "Identifier" || node.type === "ThisExpression") {
        return node;
    }

    const left = TSEntityNameToRuntime(node.left);

    // Rewrite the qualified name in place into the equivalent runtime member expression, so
    // every reference already held to this node keeps pointing at it.
    return Object.assign(node, {
        computed: false,
        object: left,
        property: node.right,
        type: "MemberExpression",
    }) as unknown as t.MemberExpression;
};

const getIdFromTSEntityName = (node: t.TSTypeName): t.Identifier | t.ThisExpression => {
    if (node.type === "Identifier" || node.type === "ThisExpression") {
        return node;
    }

    return getIdFromTSEntityName(node.left);
};

const isReferenceId = (node?: t.Node | null): node is t.Identifier | t.MemberExpression => is.oneOf(node, ["Identifier", "MemberExpression"]);

// Detects rollup's injected interop-helper imports (`__export` / `__reExport`). These come
// from rollup's synthetic helper facade, but the rendered chunk gives us no module handle to
// key off — only the binding names. RISK: a user declaration that genuinely imports a binding
// named `__export`/`__reExport` would be mis-detected. We match on the IMPORTED name (the
// canonical rollup helper name) rather than the local alias, which is the most robust signal
// available short of tracking the helper facade module — a user renaming a local TO `__export`
// no longer trips this. See also the `_exports` suffix heuristic in patchReExport.
const isHelperImport = (node: t.Node) =>
    node.type === "ImportDeclaration"
    && node.specifiers.length === 1
    && node.specifiers.every(
        (spec) => spec.type === "ImportSpecifier" && spec.imported.type === "Identifier" && ["__export", "__reExport"].includes(spec.imported.name),
    );

/**
 * patch `.d.ts` suffix in import source to `.js`
 */
const patchImportExport = (node: t.ProgramStatement, exportInfo: ChunkExportInfo, cjsDefault: boolean): t.ProgramStatement | false | undefined => {
    if (node.type === "ExportNamedDeclaration" && !node.declaration && !node.source && node.specifiers.length === 0 && !node.attributes?.length) {
        return false;
    }

    if (node.type === "ImportDeclaration" && node.specifiers.length > 0) {
        for (const specifier of node.specifiers) {
            if (isInfer(specifier.local)) {
                specifier.local.name = "__Infer";
            }
        }
    }

    if (is.oneOf(node, ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"])) {
        if (node.type === "ExportAllDeclaration" && node.source && exportInfo.typeOnlyExportAllSources.has(node.source.value)) {
            node.exportKind = "type";
        }

        // `export * as ns from "..."` is an ExportAllDeclaration with an `exported` name in
        // ESTree (babel modelled it as an ExportNamespaceSpecifier), so the namespace name has
        // to be checked against the type-only set here rather than in the specifier loop below.
        if (node.type === "ExportAllDeclaration" && node.exported && exportInfo.typeOnlyNames.has(nameOf(node.exported))) {
            node.exportKind = "type";
        }

        if (node.type === "ExportNamedDeclaration" && exportInfo.typeOnlyNames.size > 0) {
            for (const spec of node.specifiers) {
                const name = nameOf(spec.exported);

                if (exportInfo.typeOnlyNames.has(name)) {
                    spec.exportKind = "type";
                }
            }

            normalizeTypeOnlyExport(node);
        }

        if (node.source?.value && RE_DTS.test(node.source.value)) {
            node.source.value = filenameDtsTo(node.source.value, "js");
            // yuku's codegen takes the quote style of a string literal from its `raw` text.
            // Re-sync `raw` so a rewritten specifier is emitted double-quoted (what TypeScript
            // and the previous @babel/generator output both produce) instead of inheriting the
            // source's quote style, which would only apply to the literals we touched.
            node.source.raw = JSON.stringify(node.source.value);

            return node;
        }

        if (
            cjsDefault
            && node.type === "ExportNamedDeclaration"
            && !node.source
            && node.specifiers.length === 1
            && node.specifiers[0].type === "ExportSpecifier"
            && nameOf(node.specifiers[0].exported) === "default"
        ) {
            const defaultExport = node.specifiers[0];

            return b.TSExportAssignment({ expression: defaultExport.local });
        }
    }

    return undefined;
};

/**
 * Handle namespace objects: rolldown's `__export(ns, { a: () => a })` call and rollup's
 * `var ns = /*#__PURE__*\/Object.freeze({ __proto__: null, a: a })`. Both become
 * `declare namespace ns { export { a } }`.
 */
const patchTsNamespace = (nodes: t.ProgramStatement[]) => {
    const removed = new Set<t.Node>();

    for (const [i, node] of nodes.entries()) {
        const result = handleExport(node);

        if (!result) continue;

        const [binding, specifiers] = result;

        if (specifiers.length === 0) continue;

        nodes[i] = b.TSModuleDeclaration({
            body: b.TSModuleBlock({ body: [exportNamedDeclaration(specifiers)] }),
            declare: true,
            global: false,
            id: binding,
            kind: "namespace",
        });
    }

    return nodes.filter((node) => !removed.has(node));

    function handleExport(node: t.ProgramStatement): false | [t.Identifier, t.ExportSpecifier[]] {
        if (node.type !== "VariableDeclaration" || node.declarations.length !== 1 || node.declarations[0].id.type !== "Identifier") {
            return false;
        }

        const binding = node.declarations[0].id;
        const { init } = node.declarations[0];

        if (!init) return false;

        // rolldown: `__export({ a: () => a })` (`__exportAll` since 1.2)
        if (init.type === "CallExpression" && init.callee.type === "Identifier" && (init.callee.name === "__export" || init.callee.name === "__exportAll") && init.arguments.length === 1 && init.arguments[0].type === "ObjectExpression") {
            return [
                binding,
                init.arguments[0].properties
                    .filter((property): property is t.ObjectProperty => property.type === "Property")
                    .map((property) => b.ExportSpecifier({ exported: property.key as t.Identifier, local: (property.value as t.ArrowFunctionExpression).body as t.Identifier })),
            ];
        }

        // rollup: the namespace object, however `freeze` / `generatedCode.symbols` render it —
        // `{ __proto__: null, a }`, `Object.freeze({ … })` or `Object.defineProperty({ … }, Symbol.toStringTag, …)`.
        const namespaceObject = unwrapNamespaceObject(init);

        if (!namespaceObject) return false;

        const members = namespaceObject.properties.filter(
            (property): property is t.ObjectProperty => property.type === "Property" && !property.computed && !(property.key.type === "Identifier" && property.key.name === "__proto__"),
        );

        if (members.some((property) => property.value.type !== "Identifier" || (property.key.type !== "Identifier" && property.key.type !== "Literal"))) {
            return false;
        }

        return [
            binding,
            members.map((property) =>
                b.ExportSpecifier({
                    exported: property.key.type === "Identifier" ? property.key : b.Identifier({ name: (property.key as t.StringLiteral).value }),
                    local: property.value as t.Identifier,
                }),
            ),
        ];
    }

    function unwrapNamespaceObject(init: t.Expression): t.ObjectExpression | undefined {
        let candidate: t.Expression | undefined = init;

        // `Object.defineProperty(Object.freeze({ … }), Symbol.toStringTag, …)` nests the wrappers
        while (
            candidate?.type === "CallExpression"
            && candidate.callee.type === "MemberExpression"
            && candidate.callee.object.type === "Identifier"
            && candidate.callee.object.name === "Object"
            && candidate.callee.property.type === "Identifier"
            && (candidate.callee.property.name === "freeze" || candidate.callee.property.name === "defineProperty")
        ) {
            [candidate] = candidate.arguments as t.Expression[];
        }

        if (candidate?.type !== "ObjectExpression") return undefined;

        // `__proto__: null` is what marks rollup's namespace objects apart from any other object
        const isNamespace = candidate.properties.some(
            (property) => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "__proto__",
        );

        return isNamespace ? candidate : undefined;
    }
};

/**
 * Handle `__reExport` call
 */
const patchReExport = (nodes: t.ProgramStatement[]) => {
    const exportsNames = new Map<string, string>();

    for (const [i, node] of nodes.entries()) {
        if (
            node.type === "ImportDeclaration"
            && node.specifiers.length === 1
            && node.specifiers[0].type === "ImportSpecifier"
            && node.specifiers[0].local.type === "Identifier"
            // RISK: matches rollup's namespace-reexport facade binding by its `_exports` suffix
            // convention. There is no module handle in the rendered chunk to key off, so a user
            // declaration whose local binding genuinely ends in `_exports` could be mis-handled.
            // The recorded name is only acted on later if a `__reExport`/namespace member usage
            // references it, which limits (but does not eliminate) the blast radius.
            && node.specifiers[0].local.name.endsWith("_exports")
        ) {
            // record: import { t as a_exports } from "..."
            exportsNames.set(node.specifiers[0].local.name, node.specifiers[0].local.name);
        } else if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && is.Identifier(node.expression.callee, "__reExport")) {
            // record: __reExport(a_exports, import_lib)

            const args = node.expression.arguments;

            exportsNames.set((args[0] as t.Identifier).name, (args[1] as t.Identifier).name);
        } else if (
            node.type === "VariableDeclaration"
            && node.declarations.length === 1
            && node.declarations[0].init?.type === "MemberExpression"
            && node.declarations[0].init.object.type === "Identifier"
            && exportsNames.has(node.declarations[0].init.object.name)
        ) {
            // var B = a_exports.A
            // to
            // type B = [mapping].A
            // TODO how to support value import? currently only type import is supported

            nodes[i] = b.TSTypeAliasDeclaration({
                declare: false,
                id: b.Identifier({ name: (node.declarations[0].id as t.Identifier).name }),
                typeAnnotation: b.TSTypeReference({
                    typeArguments: null,
                    typeName: b.TSQualifiedName({
                        left: b.Identifier({ name: exportsNames.get(node.declarations[0].init.object.name)! }),
                        right: b.Identifier({ name: (node.declarations[0].init.property as t.Identifier).name }),
                    }),
                }),
                typeParameters: null,
            });
        } else if (
            node.type === "ExportNamedDeclaration"
            && node.specifiers.length === 1
            && node.specifiers[0].type === "ExportSpecifier"
            && node.specifiers[0].local.type === "Identifier"
            && exportsNames.has(node.specifiers[0].local.name)
        ) {
            // export { a_exports as t }
            // to
            // export { [mapping] as t }
            node.specifiers[0].local.name = exportsNames.get(node.specifiers[0].local.name)!;
        }
    }

    return nodes;
};

// fix:
// - import type { ... } from '...'
// - import { type ... } from '...'
// - export type { ... }
// - export { type ... }
// - export type * as x '...'
// - import Foo = require("./bar")
// - export = Foo
// - export default x
const rewriteImportExport = (
    node: t.Node,
    set: (node: t.ProgramStatement) => void,
    appended: t.ProgramStatement[],
    requireAsDefault: WeakSet<t.TSImportEqualsDeclaration>,
): node is t.ImportDeclaration | t.ExportAllDeclaration | t.TSImportEqualsDeclaration => {
    if (node.type === "ImportDeclaration" || (node.type === "ExportNamedDeclaration" && !node.declaration)) {
        for (const specifier of node.specifiers) {
            if (specifier.type === "ImportSpecifier") {
                specifier.importKind = "value";
            } else if (specifier.type === "ExportSpecifier") {
                specifier.exportKind = "value";
            }
        }

        if (node.type === "ImportDeclaration") {
            node.importKind = "value";
        } else if (node.type === "ExportNamedDeclaration") {
            node.exportKind = "value";
        }

        return true;
    }

    if (node.type === "ExportAllDeclaration") {
        node.exportKind = "value";

        return true;
    }

    const importEquals = node.type === "ExportNamedDeclaration" && node.declaration?.type === "TSImportEqualsDeclaration" ? node.declaration : node;

    if (importEquals.type === "TSImportEqualsDeclaration") {
        if (importEquals.moduleReference.type === "TSExternalModuleReference") {
            // `import x = require("m")` binds the whole module, so it is a namespace import —
            // a default import would demand a `default` export the target may not have. Only a
            // target written with `export =` binds that single value, i.e. its default.
            set(
                b.ImportDeclaration({
                    attributes: [],
                    phase: null,
                    source: importEquals.moduleReference.expression,
                    specifiers: [requireAsDefault.has(importEquals) ? b.ImportDefaultSpecifier({ local: importEquals.id }) : b.ImportNamespaceSpecifier({ local: importEquals.id })],
                }),
            );

            if (importEquals !== node) {
                appended.push(exportNamedDeclaration([b.ExportSpecifier({ exported: importEquals.id, local: importEquals.id })]));
            }

            return true;
        }

        // `import A = NS.Inner` (entity-name reference) is handled earlier in the transform
        // loop by rewriting it to a type alias so it flows through the normal declaration
        // machinery. It should never reach here, but guard against falling through to raw TS.
        return false;
    }

    if (node.type === "TSExportAssignment" && node.expression.type === "Identifier") {
        set(exportNamedDeclaration([b.ExportSpecifier({ exported: b.Identifier({ name: "default" }), local: node.expression })]));

        return true;
    }

    if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "Identifier") {
        set(exportNamedDeclaration([b.ExportSpecifier({ exported: b.Identifier({ name: "default" }), local: node.declaration })]));

        return true;
    }

    return false;
};

const importEqualsToTypeAlias = (node: t.TSImportEqualsDeclaration): t.TSTypeAliasDeclaration =>
    b.TSTypeAliasDeclaration({
        declare: false,
        id: node.id,
        typeAnnotation: b.TSTypeReference({ typeArguments: null, typeName: node.moduleReference as t.TSTypeName }),
        typeParameters: null,
    });

const overwriteNode = <T>(node: t.Node, newNode: T): T => {
    // clear object keys
    for (const key of Object.keys(node)) {
        Reflect.deleteProperty(node, key);
    }

    Object.assign(node, newNode);

    return node as T;
};

const inheritNodeComments = <T extends t.Node>(oldNode: t.Node, newNode: T): T => {
    newNode.comments ||= [];

    const pragmas = oldNode.comments?.filter((comment) => comment.position === "before" && comment.value.startsWith("#") && !isSourceMapPragma(comment));

    if (pragmas) {
        newNode.comments.unshift(...pragmas);
    }

    newNode.comments = newNode.comments.filter((comment) => !REFERENCE_RE.test(comment.value) && !isSourceMapPragma(comment));

    return newNode;
};

export default createFakeJsPlugin;
