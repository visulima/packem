/* eslint-disable @typescript-eslint/no-use-before-define, no-param-reassign, @typescript-eslint/no-shadow, func-style, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-non-null-assertion, unicorn/no-null, sonarjs/cognitive-complexity, jsdoc/match-description, @typescript-eslint/prefer-nullish-coalescing, no-plusplus, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access, sonarjs/function-return-type, sonarjs/different-types-comparison, no-return-assign, consistent-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-dynamic-delete, @typescript-eslint/ban-ts-comment, sonarjs/no-nested-assignment, sonarjs/no-empty-collection, no-secrets/no-secrets, no-await-in-loop, default-case -- this file implements a babel-based AST transform; helper functions are hoisted as expressions to match the data flow, params are mutated for in-place rewriting, and the SonarJS / TS-strict rules clash with the babel API's `any`-heavy types */
import path from "node:path";

import { generate } from "@babel/generator";
import { isIdentifierName } from "@babel/helper-validator-identifier";
import type { ParseResult } from "@babel/parser";
import { parse } from "@babel/parser";
import t from "@babel/types";
import { isDeclarationType, isIdentifierOf, isTypeOf, resolveString, walkAST, walkASTAsync } from "ast-kit";
import type { Plugin, RenderedChunk, TransformPluginContext, TransformResult } from "rollup";

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
    typeParams: t.TSTypeParameter[];
}[];

interface OverloadInfo {
    children: t.Node[];
    childrenOffset: number;
    decl: t.Declaration;
    deps: Dep[];
    depsOffset: number;
    params: TypeParams;
    paramsOffset: number;
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

type NamespaceMap = Map<string, { local: t.Identifier | t.TSQualifiedName; stmt: t.Statement }>;

const createFakeJsPlugin = ({ cjsDefault, sideEffects, sourcemap }: Pick<OptionsResolved, "sourcemap" | "cjsDefault" | "sideEffects">): Plugin => {
    let declarationIndex = 0;
    const declarationMap = new Map<number /* declaration id */, DeclarationInfo>();
    const commentsMap = new Map<string /* filename */, t.Comment[]>();
    const moduleExportsMap = new Map<string /* filename */, ModuleExports>();
    const warnedCjsDtsInputs = new Set<string>();

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
                    if (chunk.type === "chunk" || typeof (chunk as { source?: unknown }).source !== "string")
                        continue;

                    const map = JSON.parse((chunk as { source: string }).source);

                    map.sourcesContent = undefined;
                    (chunk as any).source = JSON.stringify(map);
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
                createParenthesizedExpressions: true,
                errorRecovery: true,
                plugins: [["typescript", { dts: true }], "decoratorAutoAccessors"],
                sourceType: "module",
            });
        } catch (error) {
            throw new Error(
                `Failed to parse ${id}. This may be caused by a syntax error in the declaration file or a bug in the plugin. Please report this issue to https://github.com/visulima/packem\n${error}`,
                { cause: error },
            );
        }

        const { comments, program } = file;

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

        if (comments) {
            const directives = collectReferenceDirectives(comments);

            commentsMap.set(id, directives);
        }

        const appendStmts: t.Statement[] = [];
        const namespaceStmts: NamespaceMap = new Map();
        // Track binding names to their declaration IDs for function overload merging
        const bindingToDeclarationId = new Map<string, number>();
        const stmtsToRemove = new Set<number>();

        for (const [i, stmt] of program.body.entries()) {
            const setStmt = (stmt: t.Statement) => (program.body[i] = stmt);

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

            if (sideEffect && stmt.id.type === "StringLiteral") {
                const resolved = await this.resolve(stmt.id.value, id);

                if (resolved && !resolved.external) {
                    resolvedModuleId = RE_DTS.test(resolved.id) ? resolved.id : filenameToDts(resolved.id);
                } else if (stmt.id.value[0] === ".") {
                    this.warn(
                        `\`declare module ${JSON.stringify(stmt.id.value)}\` will be kept as-is in the output. Relative module declaration may cause unexpected issues. Found in ${id}.`,
                    );
                }
            }

            if (sideEffect && id.endsWith(".vue.d.ts") && code.slice(stmt.start!, stmt.end!).includes("__VLS_")) {
                continue;
            }

            const isDefaultExport = stmt.type === "ExportDefaultDeclaration";
            const isDecl = isTypeOf(stmt, ["ExportNamedDeclaration", "ExportDefaultDeclaration"]) && stmt.declaration;

            const decl: t.Node = isDecl ? stmt.declaration! : stmt;
            const setDecl = isDecl ? (decl: t.Declaration) => (stmt.declaration = decl) : setStmt;

            if (decl.type !== "TSDeclareFunction" && !isDeclarationType(decl)) {
                continue;
            }

            if (
                isTypeOf(decl, [
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
                let binding = decl.id;

                if ((binding as t.Node).type === "TSQualifiedName") {
                    binding = getIdFromTSEntityName(binding as unknown as t.TSEntityName);
                }

                // Only rename when the original id can't be used as a JS identifier
                // (e.g. `declare module './foo'` — StringLiteral). `declare global { }`
                // and `declare module Foo { }` already have valid Identifier ids and
                // must keep their names so renderChunk emits the correct keyword.
                binding = sideEffect && (binding as t.Node).type !== "Identifier" ? t.identifier(`_${getIdentifierIndex(identifierMap, "")}`) : binding;
                bindings.push(binding as t.Identifier);
            } else {
                const binding = t.identifier("export_default");

                bindings.push(binding);
                // @ts-expect-error
                decl.id = binding;
            }

            const params: TypeParams = collectParams(decl);

            const childrenSet = new Set<t.Node>();
            const deps = await collectDependencies(this, decl, id, namespaceStmts, childrenSet, identifierMap);
            const children = [...childrenSet].filter((child) => bindings.every((b) => child !== b));

            if (decl !== stmt) {
                decl.leadingComments = stmt.leadingComments;
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

                existing.overloads.push({
                    children,
                    childrenOffset: existing.children.length,
                    decl,
                    deps,
                    depsOffset: existing.deps.length,
                    params,
                    paramsOffset: existing.params.length,
                });
                // Merge deps, params, and children into the primary so they go through
                // Rolldown's identifier renaming pipeline
                existing.deps.push(...deps);
                existing.params.push(...params);
                existing.children.push(...children);
                stmtsToRemove.add(i);

                continue;
            }

            const declarationId = registerDeclaration({
                bindings,
                children,
                decl,
                deps,
                params,
                resolvedModuleId,
            });

            // Track this binding so a subsequent declaration with the same name can be
            // merged as an overload (see the duplicate-binding branch above).
            if (bindings.length === 1) {
                bindingToDeclarationId.set(bindings[0].name, declarationId);
            }

            const declarationIdNode = t.numericLiteral(declarationId);
            const depsNode = t.arrowFunctionExpression(
                params.map(({ name }) => t.identifier(name)),
                t.arrayExpression(deps),
            );
            const childrenNode = t.arrayExpression(
                children.map((node) => {
                    return {
                        end: node.end,
                        loc: node.loc,
                        start: node.start,
                        type: "StringLiteral",
                        value: "",
                    };
                }),
            );
            const sideEffectNode = sideEffect && t.callExpression(t.identifier("sideEffect"), [bindings[0]]);
            const runtimeArrayNode = runtimeBindingArrayExpression(
                sideEffectNode ? [declarationIdNode, depsNode, childrenNode, sideEffectNode] : [declarationIdNode, depsNode, childrenNode],
            );

            // var ${binding} = [${declarationId}, (param, ...) => [dep, ...], [children], sideEffect()]
            const runtimeAssignment: RuntimeBindingVariableDeclration = {
                declarations: [
                    {
                        id: { ...bindings[0], typeAnnotation: null },
                        init: runtimeArrayNode,
                        type: "VariableDeclarator",
                    },
                    ...bindings.slice(1).map((binding): t.VariableDeclarator => {
                        return {
                            id: { ...binding, typeAnnotation: null },
                            type: "VariableDeclarator",
                        };
                    }),
                ],
                kind: "var",
                type: "VariableDeclaration",
            };

            if (isDefaultExport) {
                // export { ${binding} as default }
                appendStmts.push(t.exportNamedDeclaration(null, [t.exportSpecifier(bindings[0], t.identifier("default"))]));
                // replace the whole statement
                setStmt(runtimeAssignment);
            } else {
                // replace declaration, keep `export`
                setDecl(runtimeAssignment);
            }
        }

        if (sideEffects) {
            // module side effect marker
            appendStmts.push(t.expressionStatement(t.callExpression(t.identifier("sideEffect"), [])));
        }

        program.body = [
            ...Array.from(namespaceStmts.values(), ({ stmt }) => stmt),
            ...program.body.filter((_, index) => !stmtsToRemove.has(index)),
            ...appendStmts,
        ];

        const result = generate(file, {
            comments: false,
            sourceFileName: id,
            sourceMaps: sourcemap,
        });

        return result;
    }

    function renderChunk(code: string, chunk: RenderedChunk) {
        if (!RE_DTS.test(chunk.fileName)) {
            return;
        }

        const exportInfo = collectChunkExportInfo(chunk, moduleExportsMap);

        let file: ParseResult;

        try {
            file = parse(code, {
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

                const [declarationIdNode, depsFunction, children] = node.declarations[0].init.elements;

                const declarationId = declarationIdNode.value;
                const declaration = getDeclaration(declarationId);

                walkAST<t.Node | t.Comment>(declaration.decl, {
                    enter(node) {
                        if (node.type === "CommentBlock") {
                            return;
                        }

                        // Preserve loc on nodes with leading comments so @babel/generator
                        // places JSDoc comments on their own line instead of appending them
                        // to the previous line (especially in type alias bodies).
                        if (!(node as t.Node).leadingComments?.length) {
                            delete node.loc;
                        }
                    },
                });

                for (const [i, decl] of node.declarations.entries()) {
                    const transformedBinding = {
                        ...decl.id,
                        typeAnnotation: declaration.bindings[i].typeAnnotation,
                    };

                    overwriteNode(declaration.bindings[i], transformedBinding);
                }

                const primaryChildrenCount = declaration.primaryChildrenCount ?? declaration.children.length;
                const primaryParamsCount = declaration.primaryParamsCount ?? declaration.params.length;
                const primaryDepsCount = declaration.primaryDepsCount ?? declaration.deps.length;

                for (let i = 0; i < primaryChildrenCount; i++) {
                    const child = (children.elements as t.StringLiteral[])[i];

                    Object.assign(declaration.children[i], {
                        loc: child.loc,
                    });
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

                    if (
                        transformedDep
                        && (transformedDep as t.UnaryExpression).type === "UnaryExpression"
                        && (transformedDep as t.UnaryExpression).operator === "void"
                    ) {
                        transformedDep = {
                            ...t.identifier("undefined"),
                            end: transformedDep.end,
                            loc: transformedDep.loc,
                            start: transformedDep.start,
                        };
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
                    (declaration.decl.id as t.StringLiteral).value = CROSS_CHUNK_PLACEHOLDER + declaration.resolvedModuleId;
                }

                // Restore overloaded declarations before the primary declaration
                const overloadDecls: t.Statement[] = [];

                if (declaration.overloads) {
                    for (const overload of declaration.overloads) {
                        walkAST<t.Node | t.Comment>(overload.decl, {
                            enter(node) {
                                if (node.type === "CommentBlock")
                                    return;

                                delete node.loc;
                            },
                        });

                        // Use the transformed binding name from the primary declaration
                        if ("id" in overload.decl && overload.decl.id) {
                            overwriteNode(overload.decl.id, { ...declaration.bindings[0] });
                        }

                        // Patch overload children locations from the merged children array
                        for (const [i, child] of overload.children.entries()) {
                            const mergedChild = (children.elements as t.StringLiteral[])[overload.childrenOffset + i];

                            if (mergedChild) {
                                Object.assign(child, { loc: mergedChild.loc });
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

                            if ((transformedDep as t.UnaryExpression).type === "UnaryExpression" && (transformedDep as t.UnaryExpression).operator === "void") {
                                transformedDep = {
                                    ...t.identifier("undefined"),
                                    end: transformedDep.end,
                                    loc: transformedDep.loc,
                                    start: transformedDep.start,
                                };
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
        const hasModuleAugmentation = program.body.some((node) => node.type === "TSModuleDeclaration" && node.id.type === "StringLiteral");

        if (!hasExport && hasModuleAugmentation) {
            program.body.push({
                declaration: null,
                source: null,
                specifiers: [],
                type: "ExportNamedDeclaration",
            } as unknown as t.Statement);
        }

        // recover comments
        const comments = new Set<t.Comment>();
        const commentsValue = new Set<string>(); // deduplicate

        for (const id of chunk.moduleIds) {
            const preserveComments = commentsMap.get(id);

            if (preserveComments) {
                preserveComments.forEach((c) => {
                    const id = c.type + c.value;

                    if (commentsValue.has(id))
                        return;

                    commentsValue.add(id);
                    comments.add(c);
                });
                commentsMap.delete(id);
            }
        }

        if (comments.size > 0) {
            program.body[0].leadingComments ||= [];
            program.body[0].leadingComments.unshift(...comments);
        }

        const result = generate(file, {
            comments: true,
            sourceFileName: chunk.fileName,
            sourceMaps: sourcemap,
        });

        return result;
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
     */
    function collectParams(node: t.Node): TypeParams {
        const typeParams: t.TSTypeParameter[] = [];

        walkAST(node, {
            leave(node) {
                if ("typeParameters" in node && node.typeParameters?.type === "TSTypeParameterDeclaration") {
                    typeParams.push(...node.typeParameters.params);
                }
            },
        });

        const parameterMap = new Map<string, t.TSTypeParameter[]>();

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

        walkAST(node, {
            enter(node) {
                if (node.type === "TSInferType" && node.typeParameter) {
                    inferred.push(node.typeParameter.name);
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
    ): Promise<Dep[]> {
        const deps = new Set<Dep>();
        const seen = new Set<t.Node>();
        const preserveImportTypeCache = new Map<string, boolean>();

        const inferredStack: string[][] = [];
        let currentInferred = new Set<string>();

        function isInferred(node: t.Node): boolean {
            return node.type === "Identifier" && currentInferred.has(node.name);
        }

        await walkASTAsync(node, {
            enter(node) {
                if (node.type === "TSConditionalType") {
                    const inferred = collectInferredNames(node.extendsType);

                    inferredStack.push(inferred);
                }

                return Promise.resolve();
            },
            async leave(node, parent) {
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
                        addDependency(TSEntityNameToRuntime(heritage.expression));
                    }
                } else if (node.type === "ClassDeclaration") {
                    if (node.superClass)
                        addDependency(node.superClass);

                    if (node.implements) {
                        for (const implement of node.implements) {
                            if ((implement as t.Node).type === "ClassImplements") {
                                continue;
                            }

                            addDependency(TSEntityNameToRuntime((implement as t.TSExpressionWithTypeArguments).expression));
                        }
                    }
                } else if (isTypeOf(node, ["ObjectMethod", "ObjectProperty", "ClassProperty", "TSPropertySignature", "TSDeclareMethod", "TSMethodSignature"])) {
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
                            const source = node.argument;
                            const imported = node.qualifier;
                            const dep = await importNamespace(context, importer, node, imported, source, namespaceStmts, identifierMap, preserveImportTypeCache);

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

    async function importNamespace(
        context: TransformPluginContext,
        importer: string,
        node: t.TSImportType,
        imported: t.TSEntityName | null | undefined,
        source: t.StringLiteral,
        namespaceStmts: NamespaceMap,
        identifierMap: Record<string, number>,
        preserveCache: Map<string, boolean>,
    ): Promise<Dep | undefined> {
        // Inline `import("pkg").Type` references to external (or unresolvable)
        // modules must be preserved as-is. Converting them into a hoisted
        // `import * as _ from "pkg"` namespace would inline the external types and
        // break declarations that intentionally reference an external package.
        let preserve = preserveCache.get(source.value);

        if (preserve === undefined) {
            const resolved = await context.resolve(source.value, importer);

            preserve = !resolved || Boolean(resolved.external);
            preserveCache.set(source.value, preserve);
        }

        if (preserve) {
            return undefined;
        }

        const sourceText = source.value.replaceAll(/\W/g, "_");
        const localName = `_$${isIdentifierName(source.value) ? source.value : `${sourceText}${getIdentifierIndex(identifierMap, sourceText)}`}`;
        let local: t.Identifier | t.TSQualifiedName = t.identifier(localName);

        if (namespaceStmts.has(source.value)) {
            local = namespaceStmts.get(source.value)!.local;
        } else {
            // prepend: import * as ${local} from ${source}
            namespaceStmts.set(source.value, {
                local,
                stmt: t.importDeclaration([t.importNamespaceSpecifier(local)], source),
            });
        }

        if (imported) {
            const importedLeft = getIdFromTSEntityName(imported);

            overwriteNode(importedLeft, t.tsQualifiedName(local, { ...importedLeft }));
            local = imported;
        }

        let replacement: t.Node = node;

        if (node.typeParameters) {
            overwriteNode(node, t.tsTypeReference(local, node.typeParameters));
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

    if (isTypeOf(parent, ["TSPropertySignature", "TSMethodSignature"]) && parent.key === node)
        return true;

    return false;
}

const REFERENCE_RE = /\/\s*<reference\s+(?:path|types)=/;

const collectReferenceDirectives = (comment: t.Comment[], negative = false) => comment.filter((c) => REFERENCE_RE.test(c.value) !== negative);

// CommonJS declaration syntax (`export = X`, `import X = require("y")`) cannot be
// represented in a bundled ESM `.d.ts`. Used to emit a one-time warning per input.
const isCjsDtsInputSyntax = (node: t.Statement): boolean =>
    node.type === "TSExportAssignment"
    || (node.type === "TSImportEqualsDeclaration" && node.moduleReference.type === "TSExternalModuleReference");

// #region Export metadata

const collectTypeOnlyLocals = (node: t.Statement, typeOnlyLocals: Set<string>): void => {
    if (node.type !== "ImportDeclaration") {
        return;
    }

    for (const specifier of node.specifiers) {
        if (node.importKind === "type" || ("importKind" in specifier && specifier.importKind === "type")) {
            typeOnlyLocals.add(specifier.local.name);
        }
    }
};

const collectPatternNames = (node: t.Node | null | undefined): string[] => {
    if (!node) {
        return [];
    }

    switch (node.type) {
        case "ArrayPattern": {
            return node.elements.flatMap((element) => collectPatternNames(element));
        }
        case "AssignmentPattern": {
            return collectPatternNames(node.left);
        }
        case "Identifier": {
            return [node.name];
        }
        case "ObjectPattern": {
            return node.properties.flatMap((property) => collectPatternNames(property.type === "RestElement" ? property.argument : property.value));
        }
        case "RestElement": {
            return collectPatternNames(node.argument);
        }
        default: {
            return [];
        }
    }
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

const isTypeOnlyExport = (
    node: t.ExportNamedDeclaration,
    specifier: t.ExportDefaultSpecifier | t.ExportNamespaceSpecifier | t.ExportSpecifier,
): boolean => node.exportKind === "type" || ("exportKind" in specifier && specifier.exportKind === "type");

const resolveExportSource = async (context: TransformPluginContext, source: t.StringLiteral | null | undefined, importer: string): Promise<string | undefined> => {
    if (!source) {
        return undefined;
    }

    const resolved = await context.resolve(source.value, importer);

    if (!resolved || resolved.external) {
        return undefined;
    }

    return resolved.id;
};

const collectExportInfo = async (context: TransformPluginContext, node: t.Statement, id: string, info: ModuleExports): Promise<void> => {
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

            if (specifier.type === "ExportSpecifier") {
                const exported = resolveString(specifier.exported);
                const local = resolveString(specifier.local);

                if (source) {
                    info.reExports.push({ exported, local, source, typeOnly });
                } else {
                    info.exports.set(exported, typeOnly || info.typeOnlyLocals.has(local));
                }
            } else {
                info.exports.set(resolveString(specifier.exported), typeOnly);
            }
        }

        return;
    }

    if (node.type === "ExportDefaultDeclaration") {
        info.exports.set("default", false);

        return;
    }

    if (node.type === "ExportAllDeclaration") {
        info.exportAlls.push({
            rawSource: node.source.value,
            source: await resolveExportSource(context, node.source, id),
            typeOnly: node.exportKind === "type",
        });
    }
};

const collectModuleExports = async (context: TransformPluginContext, nodes: t.Statement[], id: string): Promise<ModuleExports> => {
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

const collectChunkExportInfo = (chunk: RenderedChunk, moduleExportsMap: Map<string, ModuleExports>): ChunkExportInfo => {
    const exportsByModule = resolveAllModuleExports(moduleExportsMap);
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
type RuntimeBindingVariableDeclration = t.VariableDeclaration & {
    declarations: [t.VariableDeclarator & { init: RuntimeBindingArrayExpression }, ...t.VariableDeclarator[]];
};

/**
 * Check if the given node is a {@link RuntimeBindingVariableDeclration}
 */
const isRuntimeBindingVariableDeclaration = (node: t.Node | null | undefined): node is RuntimeBindingVariableDeclration =>
    t.isVariableDeclaration(node)
    && node.declarations.length > 0
    && t.isVariableDeclarator(node.declarations[0])
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
    t.isArrayExpression(node) && isRuntimeBindingArrayElements(node.elements);

const runtimeBindingArrayExpression = (elements: RuntimeBindingArrayElements): RuntimeBindingArrayExpression =>
    t.arrayExpression(elements) as RuntimeBindingArrayExpression;

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
        declarationId?.type === "NumericLiteral"
        && deps?.type === "ArrowFunctionExpression"
        && children?.type === "ArrayExpression"
        && (!effect || effect.type === "CallExpression")
    );
};

// #endregion

const isInfer = (node: t.Node): node is t.Identifier => isIdentifierOf(node, "infer");

const isThisExpression = (node: t.Node): boolean =>
    isIdentifierOf(node, "this") || node.type === "ThisExpression" || (node.type === "MemberExpression" && isThisExpression(node.object));

const TSEntityNameToRuntime = (node: t.TSEntityName): t.MemberExpression | t.Identifier => {
    if (node.type === "Identifier") {
        return node;
    }

    const left = TSEntityNameToRuntime(node.left);

    return Object.assign(node, t.memberExpression(left, node.right));
};

const getIdFromTSEntityName = (node: t.TSEntityName): t.Identifier => {
    if (node.type === "Identifier") {
        return node;
    }

    return getIdFromTSEntityName(node.left);
};

const isReferenceId = (node?: t.Node | null): node is t.Identifier | t.MemberExpression => isTypeOf(node, ["Identifier", "MemberExpression"]);

const isHelperImport = (node: t.Node) =>
    node.type === "ImportDeclaration"
    && node.specifiers.length === 1
    && node.specifiers.every(
        (spec) => spec.type === "ImportSpecifier" && spec.imported.type === "Identifier" && ["__export", "__reExport"].includes(spec.local.name),
    );

/**
 * patch `.d.ts` suffix in import source to `.js`
 */
const patchImportExport = (node: t.Statement, exportInfo: ChunkExportInfo, cjsDefault: boolean): t.Statement | false | undefined => {
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

    if (isTypeOf(node, ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"])) {
        if (node.type === "ExportAllDeclaration" && node.source && exportInfo.typeOnlyExportAllSources.has(node.source.value)) {
            node.exportKind = "type";
        }

        if (node.type === "ExportNamedDeclaration" && exportInfo.typeOnlyNames.size > 0) {
            for (const spec of node.specifiers) {
                const name = resolveString(spec.exported);

                if (exportInfo.typeOnlyNames.has(name)) {
                    if (spec.type === "ExportSpecifier") {
                        spec.exportKind = "type";
                    } else {
                        node.exportKind = "type";
                    }
                }
            }

            normalizeTypeOnlyExport(node);
        }

        if (node.source?.value && RE_DTS.test(node.source.value)) {
            node.source.value = filenameDtsTo(node.source.value, "js");

            return node;
        }

        if (
            cjsDefault
            && node.type === "ExportNamedDeclaration"
            && !node.source
            && node.specifiers.length === 1
            && node.specifiers[0].type === "ExportSpecifier"
            && resolveString(node.specifiers[0].exported) === "default"
        ) {
            const defaultExport = node.specifiers[0];

            return {
                expression: defaultExport.local,
                type: "TSExportAssignment",
            };
        }
    }

    return undefined;
};

/**
 * Handle `__export` call
 */
const patchTsNamespace = (nodes: t.Statement[]) => {
    const removed = new Set<t.Node>();

    for (const [i, node] of nodes.entries()) {
        const result = handleExport(node);

        if (!result)
            continue;

        const [binding, exports] = result;

        if (exports.properties.length === 0)
            continue;

        nodes[i] = {
            body: {
                body: [
                    {
                        declaration: null,
                        source: null,
                        specifiers: exports.properties
                            .filter((property) => property.type === "ObjectProperty")
                            .map((property) => {
                                const local = (property.value as t.ArrowFunctionExpression).body as t.Identifier;
                                const exported = property.key as t.Identifier;

                                return t.exportSpecifier(local, exported);
                            }),
                        type: "ExportNamedDeclaration",
                    },
                ],
                type: "TSModuleBlock",
            },
            declare: true,
            id: binding,
            kind: "namespace",
            type: "TSModuleDeclaration",
        };
    }

    return nodes.filter((node) => !removed.has(node));

    function handleExport(node: t.Statement): false | [t.Identifier, t.ObjectExpression] {
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
const patchReExport = (nodes: t.Statement[]) => {
    const exportsNames = new Map<string, string>();

    for (const [i, node] of nodes.entries()) {
        if (
            node.type === "ImportDeclaration"
            && node.specifiers.length === 1
            && node.specifiers[0].type === "ImportSpecifier"
            && node.specifiers[0].local.type === "Identifier"
            && node.specifiers[0].local.name.endsWith("_exports")
        ) {
            // record: import { t as a_exports } from "..."
            exportsNames.set(node.specifiers[0].local.name, node.specifiers[0].local.name);
        } else if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && isIdentifierOf(node.expression.callee, "__reExport")) {
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

            nodes[i] = {
                id: {
                    name: (node.declarations[0].id as t.Identifier).name,
                    type: "Identifier",
                },
                type: "TSTypeAliasDeclaration",
                typeAnnotation: {
                    type: "TSTypeReference",
                    typeName: {
                        left: {
                            name: exportsNames.get(node.declarations[0].init.object.name)!,
                            type: "Identifier",
                        },
                        right: {
                            name: (node.declarations[0].init.property as t.Identifier).name,
                            type: "Identifier",
                        },
                        type: "TSQualifiedName",
                    },
                },
            };
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
    set: (node: t.Statement) => void,
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
            set({
                source: node.moduleReference.expression,
                specifiers: [
                    {
                        local: node.id,
                        type: "ImportDefaultSpecifier",
                    },
                ],
                type: "ImportDeclaration",
            });
        }

        return true;
    }

    if (node.type === "TSExportAssignment" && node.expression.type === "Identifier") {
        set({
            specifiers: [
                {
                    exported: {
                        name: "default",
                        type: "Identifier",
                    },
                    local: node.expression,
                    type: "ExportSpecifier",
                },
            ],
            type: "ExportNamedDeclaration",
        });

        return true;
    }

    if (node.type === "ExportDefaultDeclaration" && node.declaration.type === "Identifier") {
        set({
            specifiers: [
                {
                    exported: t.identifier("default"),
                    local: node.declaration,
                    type: "ExportSpecifier",
                },
            ],
            type: "ExportNamedDeclaration",
        });

        return true;
    }

    return false;
};

const overwriteNode = <T>(node: t.Node, newNode: T): T => {
    // clear object keys
    for (const key of Object.keys(node)) {
        delete (node as any)[key];
    }

    Object.assign(node, newNode);

    return node as T;
};

const inheritNodeComments = <T extends t.Node>(oldNode: t.Node, newNode: T): T => {
    newNode.leadingComments ||= [];

    const leadingComments = oldNode.leadingComments?.filter((comment) => comment.value.startsWith("#"));

    if (leadingComments) {
        newNode.leadingComments.unshift(...leadingComments);
    }

    newNode.leadingComments = collectReferenceDirectives(newNode.leadingComments, true);

    return newNode;
};

export default createFakeJsPlugin;
