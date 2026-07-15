/* eslint-disable @typescript-eslint/no-use-before-define, no-param-reassign, @typescript-eslint/no-shadow, func-style, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-non-null-assertion, unicorn/no-null, sonarjs/cognitive-complexity, jsdoc/match-description, @typescript-eslint/prefer-nullish-coalescing, no-plusplus, @typescript-eslint/restrict-template-expressions, sonarjs/function-return-type, sonarjs/different-types-comparison, no-return-assign, consistent-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-dynamic-delete, sonarjs/no-nested-assignment, sonarjs/no-empty-collection, no-secrets/no-secrets, no-await-in-loop, default-case -- this file implements a yuku-based AST transform; helper functions are hoisted as expressions to match the data flow, params are mutated for in-place rewriting, and several SonarJS / TS-strict rules clash with the in-place ESTree node rewriting this transform relies on */
import path from "node:path";

import type { ExistingRawSourceMap, NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput, TransformPluginContext, TransformResult } from "rollup";
import { b, is } from "yuku-ast";
import { isIdentifierName } from "yuku-ast/identifier";
import { nameOf } from "yuku-ast/utils";
import { print } from "yuku-codegen";
// eslint-disable-next-line import/no-namespace -- the ESTree/TS-ESTree node types are a large flat namespace; importing them one by one would add ~40 named type imports
import type * as t from "yuku-parser";
import type { ParseResult } from "yuku-parser";
import { parse, walk } from "yuku-parser";

import { filenameDtsTo, filenameJsToDts, filenameToDts, RE_DTS, RE_DTS_MAP, RE_NODE_MODULES, replaceTemplateName, resolveTemplateFunction } from "./filename";
import type { OptionsResolved } from "./options";

// input:
// export declare function x(xx: X): void

// to:            const x   = [1, () => X  ]
// after compile: const x$1 = [1, () => X$1]

// replace X with X$1
// output:
// export declare function x$1(xx: X$1): void

type Dep = t.Expression & { replace?: (newNode: t.Node) => void };

const CROSS_CHUNK_PLACEHOLDER = "__rollup_dts_resolve__:";

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
    deps: Dep[];
    depsOffset: number;
    params: TypeParams;
    paramsOffset: number;
    /**
     * Index into the primary declaration's `bindings` that this overload's name maps to.
     * The primary can bind several names (`const a, b`), so an overload merged onto `b`
     * must be renamed to `bindings[1]`, not always `bindings[0]`.
     */
    primaryBindingIndex: number;
}

interface DeclarationInfo {
    bindings: t.Identifier[];
    children: t.Node[];
    decl: t.Declaration;
    deps: Dep[];
    overloads?: OverloadInfo[];
    params: TypeParams;
    /** Number of children belonging to the primary declaration (before merging overloads) */
    primaryChildrenCount?: number;
    /** Number of deps belonging to the primary declaration (before merging overloads) */
    primaryDepsCount?: number;
    /** Number of params belonging to the primary declaration (before merging overloads) */
    primaryParamsCount?: number;
    resolvedModuleId?: string;
    /** Original `program.body` index of this declaration's statement (used to drop it on a role swap). */
    stmtIndex: number;
}

interface ModuleExports {
    exportAlls: ExportAllInfo[];
    exports: Map<string, boolean>;
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

const createFakeJsPlugin = ({ cjsDefault, sideEffects, sourcemap }: Pick<OptionsResolved, "sourcemap" | "cjsDefault" | "sideEffects">): Plugin => {
    let declarationIndex = 0;
    const declarationMap = new Map<number /* declaration id */, DeclarationInfo>();
    const commentsMap = new Map<string /* filename */, t.Comment[]>();
    const moduleExportsMap = new Map<string /* filename */, ModuleExports>();
    const warnedCjsDtsInputs = new Set<string>();
    // Cross-module type-only propagation depends only on `moduleExportsMap`, not on
    // the chunk, so it is computed once per render and shared across all chunks
    // (reset in `renderStart` to stay correct in watch mode).
    let resolvedExportsByModule: Map<string, Map<string, boolean>> | undefined;

    return {
        generateBundle(_options, bundle) {
            // Build moduleId → chunk.fileName mapping
            const moduleToChunk = new Map<string, string>();

            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== "chunk")
                    continue;

                for (const moduleId of chunk.moduleIds) {
                    moduleToChunk.set(moduleId, chunk.fileName);
                }
            }

            // Rewrite `declare module` placeholders to output chunk paths
            const placeholderRe = new RegExp(`"${CROSS_CHUNK_PLACEHOLDER}(.+?)"`, "g");

            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== "chunk" || !RE_DTS.test(chunk.fileName))
                    continue;

                if (!chunk.code.includes(CROSS_CHUNK_PLACEHOLDER))
                    continue;

                chunk.code = chunk.code.replaceAll(placeholderRe, (_match, resolvedId: string) => {
                    const targetFileName = moduleToChunk.get(resolvedId);

                    if (!targetFileName)
                        return _match;

                    let specifier = path.posix.relative(path.posix.dirname(chunk.fileName), targetFileName);

                    if (!specifier.startsWith("."))
                        specifier = `./${specifier}`;

                    specifier = filenameDtsTo(specifier, "js");

                    return JSON.stringify(specifier);
                });
            }

            for (const chunk of Object.values(bundle)) {
                if (!RE_DTS_MAP.test(chunk.fileName))
                    continue;

                if (sourcemap) {
                    if (chunk.type === "chunk" || typeof chunk.source !== "string")
                        continue;

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
                chunkFileNames(chunk) {
                    const nameTemplate = resolveTemplateFunction(chunk.isEntry ? entryFileNames || "[name].js" : chunkFileNames || "[name]-[hash].js", chunk);

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

                    return nameTemplate;
                },
                sourcemap: options.sourcemap || sourcemap,
            };
        },
        renderChunk,

        renderStart() {
            // Invalidate the per-render type-only propagation cache so watch-mode
            // rebuilds recompute it from the freshly-populated moduleExportsMap.
            resolvedExportsByModule = undefined;
        },

        async transform(code: string, id: string) {
            if (!RE_DTS.test(id))
                return;

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
        moduleExportsMap.set(id, await collectModuleExports(this, program.body, id));

        const directives = collectReferenceDirectives(file.comments);

        if (directives.length > 0) {
            commentsMap.set(id, directives);
        }

        const appendStmts: t.ProgramStatement[] = [];
        const namespaceStmts: NamespaceMap = new Map();
        // Track binding names to their declaration IDs for function overload merging
        const bindingToDeclarationId = new Map<string, number>();
        const stmtsToRemove = new Set<number>();
        // Memoize `context.resolve(source, importer)` results for `import("x").T` references
        // across every declaration in THIS module. Module-scoped + same importer, so the same
        // specifier referenced in N declarations is resolved exactly once.
        const preserveImportTypeCache = new Map<string, boolean>();

        // `import A = NS.Inner` (entity-name import-equals, not `= require(...)`) and
        // `export = NS.thing` (non-identifier export-assignment) have no JS equivalent and,
        // left raw, make rollup's parser die with cryptic `Expected ',', got '='` /
        // `Expected '{', got '='`. Normalize them up-front into a type alias / default export
        // so they flow through the normal declaration machinery below.
        for (const [i, stmt] of program.body.entries()) {
            if (stmt.type === "TSImportEqualsDeclaration" && stmt.moduleReference.type !== "TSExternalModuleReference") {
                program.body[i] = b.tsTypeAliasDeclaration(stmt.id, b.tsTypeReference(stmt.moduleReference));
            } else if (stmt.type === "TSExportAssignment" && stmt.expression.type !== "Identifier") {
                program.body[i] = b.exportDefaultDeclaration(stmt.expression);
            }
        }

        for (const [i, stmt] of program.body.entries()) {
            const setStmt = (stmt: t.ProgramStatement) => (program.body[i] = stmt);

            if (rewriteImportExport(stmt, setStmt))
                continue;

            // `export as namespace X;` is a TypeScript UMD global declaration with no
            // JS equivalent. Strip it — leaving it in the output makes rollup's parser
            // fail on the unknown `export as` syntax.
            if (stmt.type === "TSNamespaceExportDeclaration") {
                stmtsToRemove.add(i);

                continue;
            }

            const sideEffect = stmt.type === "TSModuleDeclaration" && stmt.kind !== "namespace";

            // Resolve local `declare module './foo'` targets so that specifiers
            // can be rewritten to point to the correct output chunk.
            let resolvedModuleId: string | undefined;

            if (sideEffect && stmt.type === "TSModuleDeclaration" && is.StringLiteral(stmt.id)) {
                const resolved = await this.resolve(stmt.id.value, id);

                if (resolved && !resolved.external) {
                    resolvedModuleId = RE_DTS.test(resolved.id) ? resolved.id : filenameToDts(resolved.id);
                } else if (stmt.id.value[0] === ".") {
                    this.warn(
                        `\`declare module ${JSON.stringify(stmt.id.value)}\` will be kept as-is in the output. Relative module declaration may cause unexpected issues. Found in ${id}.`,
                    );
                }
            }

            if (sideEffect && id.endsWith(".vue.d.ts") && code.slice(stmt.start, stmt.end).includes("__VLS_")) {
                continue;
            }

            const isDefaultExport = stmt.type === "ExportDefaultDeclaration";
            const isDecl = is.oneOf(stmt, ["ExportNamedDeclaration", "ExportDefaultDeclaration"]) && !!stmt.declaration;

            const decl: t.Node = isDecl ? stmt.declaration! : stmt;
            const setDecl = isDecl ? (decl: t.Declaration) => ((stmt as t.ExportNamedDeclaration).declaration = decl) : setStmt;

            if (decl.type !== "TSDeclareFunction" && !is.Declaration(decl)) {
                continue;
            }

            if (
                is.oneOf(decl, [
                    "TSEnumDeclaration",
                    "ClassDeclaration",
                    "FunctionDeclaration",
                    "TSDeclareFunction",
                    "TSModuleDeclaration",
                    "VariableDeclaration",
                ])
            ) {
                decl.declare = true;
            }

            const bindings: t.Identifier[] = [];

            if (decl.type === "VariableDeclaration") {
                bindings.push(...decl.declarations.map((decl) => decl.id as t.Identifier));
            } else if ("id" in decl && decl.id) {
                let binding: t.Node = decl.id;

                if (binding.type === "TSQualifiedName") {
                    binding = getIdFromTSEntityName(binding);
                }

                // Only rename when the original id can't be used as a JS identifier
                // (e.g. `declare module './foo'` — a string literal). `declare global { }`
                // and `declare module Foo { }` already have valid Identifier ids and
                // must keep their names so renderChunk emits the correct keyword.
                if (sideEffect && binding.type !== "Identifier") {
                    binding = b.identifier(`_${getIdentifierIndex(identifierMap, "")}`);
                }

                if (binding.type !== "Identifier") {
                    throw new Error(`Unexpected ${binding.type} declaration id`);
                }

                bindings.push(binding);
            } else {
                const binding = b.identifier("export_default");

                bindings.push(binding);
                (decl as { id?: t.Identifier }).id = binding;
            }

            const params: TypeParams = collectParams(decl);

            const childrenSet = new Set<t.Node>();
            const deps = await collectDependencies(this, decl, id, namespaceStmts, childrenSet, identifierMap, preserveImportTypeCache);
            const children = [...childrenSet].filter((child) => bindings.every((b) => child !== b));

            if (decl !== stmt) {
                decl.comments = stmt.comments;
            }

            // Handle TypeScript declaration merging: a later declaration with the
            // same bound name (function overloads, function+namespace, class+namespace,
            // interface+const, interface+interface, ...) is attached to the primary as
            // an "overload" so we emit only one `export { X }` at the fake-JS level —
            // rollup's assertUniqueExportName rejects two exports of the same local name.
            // Both declaration bodies are still rendered in renderChunk, and TypeScript's
            // local declaration-merging rules reunite them via the single final export.
            const collidingIndex = bindings.findIndex((binding) => bindingToDeclarationId.has(binding.name));

            // A multi-binding declaration (`const a, b`) owns a runtime `var [a, b] = [...]`
            // array pattern that cannot be demoted to an overload — its extra bindings would
            // lose their export. So the multi-binding declaration must always be the primary.
            // When the *incoming* declaration is single-binding it folds into whatever primary
            // already owns the name; when it is multi-binding and the existing primary is
            // single-binding (and hasn't itself accumulated overloads yet), we swap roles:
            // register the incoming declaration as primary below and fold the existing one in.
            let swapExisting: DeclarationInfo | undefined;

            if (collidingIndex !== -1) {
                const collidingName = bindings[collidingIndex].name;
                const existingId = bindingToDeclarationId.get(collidingName)!;
                const existing = getDeclaration(existingId);

                if (bindings.length === 1) {
                    foldOverload(existing, {
                        children,
                        decl,
                        deps,
                        params,
                        primaryBindingIndex: existing.bindings.findIndex((binding) => binding.name === collidingName),
                    });
                    stmtsToRemove.add(i);

                    continue;
                }

                if (existing.bindings.length === 1 && !existing.overloads) {
                    swapExisting = existing;
                    stmtsToRemove.add(existing.stmtIndex);
                }

                // Otherwise (two multi-binding declarations share a name — invalid TS) fall
                // through and register separately; rollup will surface the duplicate.
            }

            const declarationId = registerDeclaration({
                bindings,
                children,
                decl,
                deps,
                params,
                resolvedModuleId,
                stmtIndex: i,
            });

            // Role swap: fold the existing single-binding declaration into the just-registered
            // multi-binding primary, and re-point its name at the new primary.
            if (swapExisting) {
                foldOverload(getDeclaration(declarationId), {
                    children: swapExisting.children,
                    decl: swapExisting.decl,
                    deps: swapExisting.deps,
                    params: swapExisting.params,
                    primaryBindingIndex: bindings.findIndex((binding) => binding.name === swapExisting!.bindings[0].name),
                });
                bindingToDeclarationId.set(swapExisting.bindings[0].name, declarationId);
            }

            // Track every binding so a subsequent declaration with the same name can be
            // merged as an overload (see the duplicate-binding branch above). All bindings of a
            // multi-declarator `const a, b` are tracked so a later `interface a` still merges.
            for (const binding of bindings) {
                bindingToDeclarationId.set(binding.name, declarationId);
            }

            const declarationIdNode = b.numericLiteral(declarationId);
            const depsNode = b.arrowFunctionExpression(
                params.map(({ name }) => b.identifier(name)),
                b.arrayExpression(deps),
            );
            const childrenNode = b.arrayExpression(
                children.map((node) => {
                    const placeholder = b.stringLiteral("");

                    placeholder.start = node.start;
                    placeholder.end = node.end;

                    return placeholder;
                }),
            );
            const sideEffectNode = sideEffect && b.callExpression(b.identifier("sideEffect"), [bindings[0]]);
            const runtimeArrayNode = runtimeBindingArrayExpression(
                sideEffectNode ? [declarationIdNode, depsNode, childrenNode, sideEffectNode] : [declarationIdNode, depsNode, childrenNode],
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
            const runtimeAssignment = b.variableDeclaration("var", [
                b.variableDeclarator(b.arrayPattern(bindings.map((binding) => { return { ...binding, typeAnnotation: null }; })), runtimeArrayNode),
            ]) as RuntimeBindingVariableDeclration;

            if (isDefaultExport) {
                // export { ${binding} as default }
                appendStmts.push(b.exportNamedDeclaration(null, [b.exportSpecifier(bindings[0], b.identifier("default"))]));
                // replace the whole statement
                setStmt(runtimeAssignment);
            } else {
                // replace declaration, keep `export`
                setDecl(runtimeAssignment);
            }
        }

        if (sideEffects) {
            // module side effect marker
            appendStmts.push(b.expressionStatement(b.callExpression(b.identifier("sideEffect"), [])));
        }

        program.body = [
            ...Array.from(namespaceStmts.values(), ({ stmt }) => stmt),
            ...program.body.filter((_, index) => !stmtsToRemove.has(index)),
            ...appendStmts,
        ];

        const result = print(program, {
            comments: false,
            ...sourcemap && {
                sourceMaps: { source: code, sourceFileName: id },
            },
        });

        return {
            code: result.code,
            map: (result.map ?? null) as SourceMapInput | null,
        };
    }

    function renderChunk(code: string, chunk: RenderedChunk, options: NormalizedOutputOptions) {
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
                if (isHelperImport(node))
                    return [];

                if (node.type === "ExpressionStatement")
                    return [];

                const newNode = patchImportExport(node, exportInfo, cjsDefault);

                if (newNode === false)
                    return [];

                if (newNode)
                    return [newNode];

                if (node.type !== "VariableDeclaration")
                    return [node];

                if (!isRuntimeBindingVariableDeclaration(node)) {
                    return [];
                }

                const [runtimeDeclarator] = node.declarations;
                const [declarationIdNode, depsFunction, children] = runtimeDeclarator.init.elements;

                const declarationId = declarationIdNode.value as number;
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
                const primaryDepsCount = declaration.primaryDepsCount ?? declaration.deps.length;

                if (sourcemap) {
                    for (let i = 0; i < primaryChildrenCount; i++) {
                        const child = (children.elements as t.StringLiteral[])[i];

                        Object.assign(declaration.children[i], {
                            end: child.end,
                            start: child.start,
                        });
                    }
                }

                const transformedParams = depsFunction.params as t.Identifier[];

                for (let i = 0; i < primaryParamsCount; i++) {
                    const transformedParameter = transformedParams[i];
                    const transformedName = transformedParameter.name;

                    for (const originalTypeParameter of declaration.params[i].typeParams) {
                        originalTypeParameter.name = transformedName;
                    }
                }

                const transformedDeps = (depsFunction.body as t.ArrayExpression).elements as t.Expression[];

                for (let i = 0; i < primaryDepsCount; i++) {
                    const originalDep = declaration.deps[i];
                    let transformedDep = transformedDeps[i];

                    if (!transformedDep)
                        continue;

                    if (transformedDep.type === "UnaryExpression" && transformedDep.operator === "void") {
                        const undefinedDep = b.identifier("undefined");

                        undefinedDep.start = transformedDep.start;
                        undefinedDep.end = transformedDep.end;
                        transformedDep = undefinedDep;
                    } else if (isInfer(transformedDep)) {
                        transformedDep.name = "__Infer";
                    }

                    if (originalDep.replace) {
                        originalDep.replace(transformedDep);
                    } else {
                        Object.assign(originalDep, transformedDep);
                    }
                }

                // Rewrite local `declare module` specifier → placeholder for generateBundle
                if (declaration.decl.type === "TSModuleDeclaration" && declaration.resolvedModuleId) {
                    declaration.decl.id = b.stringLiteral(CROSS_CHUNK_PLACEHOLDER + declaration.resolvedModuleId);
                }

                // Restore overloaded declarations before the primary declaration
                const overloadDecls: t.ProgramStatement[] = [];

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

                        // Rename the overload to the primary binding it merged onto — the specific
                        // one it collided with (a multi-binding primary like `const a, b` can hold
                        // overloads on either name), not always `bindings[0]`. Only the renamed
                        // *name* and its span are taken from the primary binding: a `const`'s type
                        // annotation must not leak onto an `interface`/`function`/`class` id, which
                        // would emit invalid output like `interface a: number { … }`.
                        if ("id" in overload.decl && overload.decl.id) {
                            overwriteNode(overload.decl.id, { ...declaration.bindings[overload.primaryBindingIndex], typeAnnotation: null });
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
                                    typeParameter.name = mergedParameter.name;
                                }
                            }
                        }

                        // Patch overload deps from the merged deps array
                        for (const [i, originalDep] of overload.deps.entries()) {
                            let transformedDep = transformedDeps[overload.depsOffset + i];

                            if (!transformedDep)
                                continue;

                            if (transformedDep.type === "UnaryExpression" && transformedDep.operator === "void") {
                                const undefinedDep = b.identifier("undefined");

                                undefinedDep.start = transformedDep.start;
                                undefinedDep.end = transformedDep.end;
                                transformedDep = undefinedDep;
                            } else if (isInfer(transformedDep)) {
                                transformedDep.name = "__Infer";
                            }

                            if (originalDep.replace) {
                                originalDep.replace(transformedDep);
                            } else {
                                Object.assign(originalDep, transformedDep);
                            }
                        }

                        overloadDecls.push(overload.decl);
                    }
                }

                return [inheritNodeComments(node, declaration.decl), ...overloadDecls];
            })
            .filter((node) => !!node);

        if (program.body.length === 0) {
            return "export { };";
        }

        // Ensure files with `declare module '...'` augmentations retain an `export {}`
        // so TypeScript treats them as modules. Without it, module augmentations are ignored.
        // `declare global` does NOT require this — it works in both scripts and modules.
        const hasExport = program.body.some(
            (node) => node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" || node.type === "ExportAllDeclaration",
        );
        const hasModuleAugmentation = program.body.some((node) => node.type === "TSModuleDeclaration" && is.StringLiteral(node.id));

        if (!hasExport && hasModuleAugmentation) {
            program.body.push(b.exportNamedDeclaration(null, []));
        }

        // recover comments
        const comments = new Set<t.Comment>();
        const commentsValue = new Set<string>(); // deduplicate

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
                    const rebased = rebaseReferencePath(c, sourceDirectory, chunkOutputDirectory);
                    const dedupeKey = rebased.type + rebased.value;

                    if (commentsValue.has(dedupeKey))
                        return;

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

        const result = print(program, {
            comments: true,
            ...sourcemap && {
                sourceMaps: { source: code, sourceFileName: chunk.fileName },
            },
        });

        return {
            code: result.code,
            map: (result.map ?? null) as SourceMapInput | null,
        };
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

    // Attach `overload` (a single-binding declaration that shares a name with `primary`) so both
    // bodies render but only the primary emits an export. The overload's deps/params/children are
    // appended to the primary's arrays — with the pre-merge offsets recorded — so they flow through
    // rollup's identifier renamer alongside the primary's own.
    function foldOverload(primary: DeclarationInfo, overload: Omit<OverloadInfo, "childrenOffset" | "depsOffset" | "paramsOffset">) {
        if (!primary.overloads) {
            primary.overloads = [];
            primary.primaryDepsCount = primary.deps.length;
            primary.primaryParamsCount = primary.params.length;
            primary.primaryChildrenCount = primary.children.length;
        }

        primary.overloads.push({
            ...overload,
            childrenOffset: primary.children.length,
            depsOffset: primary.deps.length,
            paramsOffset: primary.params.length,
        });

        primary.deps.push(...overload.deps);
        primary.params.push(...overload.params);
        primary.children.push(...overload.children);
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

        return Array.from(parameterMap.entries(), ([name, typeParams]) => {
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
        namespaceStmts: NamespaceMap,
        children: Set<t.Node>,
        identifierMap: Record<string, number>,
        // Module-scoped cache (keyed by import specifier, shared across all declarations of the
        // same module/importer) so `context.resolve` for `import("x").T` runs once per specifier.
        preserveImportTypeCache: Map<string, boolean>,
    ): Promise<Dep[]> {
        const deps = new Set<Dep>();
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
                if (node.type === "TSConditionalType") {
                    const inferred = collectInferredNames(node.extendsType);

                    inferredStack.push(inferred);
                }
            },
            leave(node, context) {
                const { parent } = context;

                if (node.type === "TSConditionalType") {
                    inferredStack.pop();
                } else if (parent?.type === "TSConditionalType") {
                    const trueBranch = parent.trueType === node;

                    currentInferred = new Set<string>((trueBranch ? inferredStack : inferredStack.slice(0, -1)).flat());
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
                    if (node.superClass)
                        addDependency(node.superClass);

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
                            const dep = importNamespace(node, qualifier, source, namespaceStmts, identifierMap, preserveImportTypeCache);

                            if (dep)
                                addDependency(dep);

                            break;
                        }
                        case "TSTypeQuery": {
                            if (seen.has(node.exprName))
                                return;

                            if (node.exprName.type === "TSImportType")
                                break;

                            addDependency(TSEntityNameToRuntime(node.exprName));

                            break;
                        }
                        case "TSTypeReference": {
                            addDependency(TSEntityNameToRuntime(node.typeName));

                            break;
                        }
                    }
                }

                if (parent && !deps.has(node as Dep) && isChildSymbol(node, parent)) {
                    children.add(node);
                }
            },
        });

        return [...deps];

        function addDependency(node: Dep) {
            if (isThisExpression(node) || isInferred(node))
                return;

            deps.add(node);
        }
    }

    function importNamespace(
        node: t.TSImportType,
        imported: t.TSImportTypeQualifier | null | undefined,
        source: t.StringLiteral,
        namespaceStmts: NamespaceMap,
        identifierMap: Record<string, number>,
        preserveCache: Map<string, boolean>,
    ): Dep | undefined {
        // Inline `import("pkg").Type` references to external (or unresolvable)
        // modules must be preserved as-is. Converting them into a hoisted
        // `import * as _ from "pkg"` namespace would inline the external types and
        // break declarations that intentionally reference an external package.
        const preserve = preserveCache.get(source.value) ?? true;

        if (preserve) {
            return undefined;
        }

        const sourceText = source.value.replaceAll(/\W/g, "_");
        const localName = `_$${isIdentifierName(source.value) ? source.value : `${sourceText}${getIdentifierIndex(identifierMap, sourceText)}`}`;
        let local: t.Identifier | t.TSQualifiedName = b.identifier(localName);

        if (namespaceStmts.has(source.value)) {
            local = namespaceStmts.get(source.value)!.local;
        } else {
            // prepend: import * as ${local} from ${source}
            namespaceStmts.set(source.value, {
                local,
                stmt: b.importDeclaration([b.importNamespaceSpecifier(local)], source),
            });
        }

        if (imported) {
            const importedLeft = getIdFromTSEntityName(imported);

            if (importedLeft.type === "ThisExpression") {
                throw new Error("Cannot import `this` from module.");
            }

            overwriteNode(importedLeft, b.tsQualifiedName(local, { ...importedLeft }));
            local = imported;
        }

        let replacement: t.Node = node;

        if (node.typeArguments) {
            overwriteNode(node, b.tsTypeReference(local, node.typeArguments));
            replacement = local;
        } else {
            overwriteNode(node, local);
        }

        const dep: Dep = {
            ...TSEntityNameToRuntime(local),
            replace(newNode) {
                overwriteNode(replacement, newNode);
            },
        };

        return dep;
    }
};

function isChildSymbol(node: t.Node, parent: t.Node): boolean {
    if (node.type === "Identifier")
        return true;

    if (is.oneOf(parent, ["TSPropertySignature", "TSMethodSignature"]) && parent.key === node)
        return true;

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
        return node.declarations.flatMap((decl) => collectPatternNames(decl.id));
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
            const typeOnly = isTypeOnlyExport(node, specifier);
            const exported = nameOf(specifier.exported)!;
            const local = nameOf(specifier.local)!;

            if (source) {
                info.reExports.push({ exported, local, source, typeOnly });
            } else {
                info.exports.set(exported, typeOnly || info.typeOnlyLocals.has(local));
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
            info.exports.set(nameOf(node.exported)!, node.exportKind === "type");

            return;
        }

        info.exportAlls.push({
            rawSource: node.source.value,
            source: await resolveExportSource(context, node.source, id),
            typeOnly: node.exportKind === "type",
        });
    }
};

const collectModuleExports = async (context: TransformPluginContext, nodes: t.ProgramStatement[], id: string): Promise<ModuleExports> => {
    const info: ModuleExports = {
        exportAlls: [],
        exports: new Map(),
        reExports: [],
        typeOnlyLocals: new Set(),
    };

    for (const node of nodes) {
        collectTypeOnlyLocals(node, info.typeOnlyLocals);
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

    let changed = true;

    while (changed) {
        changed = false;

        for (const [id, info] of moduleExportsMap) {
            // Start from the module's genuine direct exports each pass so a
            // re-export's flag can be revised upward as its source resolves.
            const next = new Map(info.exports);

            for (const reExport of info.reExports) {
                const sourceExports = reExport.source ? exportsByModule.get(reExport.source) : undefined;
                const sourceTypeOnly = sourceExports?.get(reExport.local) ?? false;

                setExportTypeOnly(next, reExport.exported, reExport.typeOnly || sourceTypeOnly);
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
                changed = true;
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
    b.arrayExpression([...elements]) as RuntimeBindingArrayExpression;

type RuntimeBindingArrayElementsBase = [declarationId: t.NumericLiteral, deps: t.ArrowFunctionExpression, children: t.ArrayExpression];

/**
 * An array that represents the elements in {@link RuntimeBindingArrayExpression}
 */
type RuntimeBindingArrayElements = RuntimeBindingArrayElementsBase | [...RuntimeBindingArrayElementsBase, effect: t.CallExpression];

/**
 * Check if the given array is a {@link RuntimeBindingArrayElements}
 */
const isRuntimeBindingArrayElements = (elements: (t.Node | null | undefined)[]): elements is RuntimeBindingArrayElements => {
    const [declarationId, deps, children, effect] = elements;

    return (
        is.NumericLiteral(declarationId)
        && deps?.type === "ArrowFunctionExpression"
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
        if (node.type === "ExportAllDeclaration" && node.exported && exportInfo.typeOnlyNames.has(nameOf(node.exported)!)) {
            node.exportKind = "type";
        }

        if (node.type === "ExportNamedDeclaration" && exportInfo.typeOnlyNames.size > 0) {
            for (const spec of node.specifiers) {
                const name = nameOf(spec.exported)!;

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

            return b.tsExportAssignment(defaultExport.local);
        }
    }

    return undefined;
};

/**
 * Handle `__export` call
 */
const patchTsNamespace = (nodes: t.ProgramStatement[]) => {
    const removed = new Set<t.Node>();

    for (const [i, node] of nodes.entries()) {
        const result = handleExport(node);

        if (!result)
            continue;

        const [binding, exports] = result;

        if (exports.properties.length === 0)
            continue;

        const namespaceExport = b.exportNamedDeclaration(
            null,
            exports.properties
                .filter((property) => property.type === "Property")
                .map((property) => {
                    const local = (property.value as t.ArrowFunctionExpression).body as t.Identifier;
                    const exported = property.key as t.Identifier;

                    return b.exportSpecifier(local, exported);
                }),
        );

        nodes[i] = b.tsModuleDeclaration(binding, b.tsModuleBlock([namespaceExport]), { declare: true, kind: "namespace" });
    }

    return nodes.filter((node) => !removed.has(node));

    function handleExport(node: t.ProgramStatement): false | [t.Identifier, t.ObjectExpression] {
        if (
            node.type !== "VariableDeclaration"
            || node.declarations.length !== 1
            || node.declarations[0].id.type !== "Identifier"
            || node.declarations[0].init?.type !== "CallExpression"
            || node.declarations[0].init.callee.type !== "Identifier"
            || node.declarations[0].init.callee.name !== "__export"
            || node.declarations[0].init.arguments.length !== 1
            || node.declarations[0].init.arguments[0].type !== "ObjectExpression"
        ) {
            return false;
        }

        const source = node.declarations[0].id;
        const exports = node.declarations[0].init.arguments[0];

        return [source, exports] as const;
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

            nodes[i] = b.tsTypeAliasDeclaration(
                b.identifier((node.declarations[0].id as t.Identifier).name),
                b.tsTypeReference(
                    b.tsQualifiedName(
                        b.identifier(exportsNames.get(node.declarations[0].init.object.name)!),
                        b.identifier((node.declarations[0].init.property as t.Identifier).name),
                    ),
                ),
            );
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

    if (node.type === "TSImportEqualsDeclaration") {
        if (node.moduleReference.type === "TSExternalModuleReference") {
            set(b.importDeclaration([b.importDefaultSpecifier(node.id)], node.moduleReference.expression));

            return true;
        }

        // `import A = NS.Inner` (entity-name reference) is handled earlier in the transform
        // loop by rewriting it to a type alias so it flows through the normal declaration
        // machinery. It should never reach here, but guard against falling through to raw TS.
        return false;
    }

    if (node.type === "TSExportAssignment" && node.expression.type === "Identifier") {
        set(b.exportNamedDeclaration(null, [b.exportSpecifier(node.expression, b.identifier("default"))]));

        return true;
    }

    if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "Identifier") {
        set(b.exportNamedDeclaration(null, [b.exportSpecifier(node.declaration, b.identifier("default"))]));

        return true;
    }

    return false;
};

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

    const pragmas = oldNode.comments?.filter(
        (comment) => comment.position === "before" && comment.value.startsWith("#") && !isSourceMapPragma(comment),
    );

    if (pragmas) {
        newNode.comments.unshift(...pragmas);
    }

    newNode.comments = newNode.comments.filter((comment) => !REFERENCE_RE.test(comment.value) && !isSourceMapPragma(comment));

    return newNode;
};

export default createFakeJsPlugin;
