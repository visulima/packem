import path from "node:path";

import { generate } from "@babel/generator";
import { isIdentifierName } from "@babel/helper-validator-identifier";
import { parse } from "@babel/parser";
import t from "@babel/types";
import { isDeclarationType, isIdentifierOf, isTypeOf, resolveString, walkAST } from "ast-kit";
import type { Plugin, RenderedChunk, TransformPluginContext, TransformResult } from "rollup";

import {
    filename_dts_to,
    filename_js_to_dts,
    filename_to_dts,
    RE_DTS,
    RE_DTS_MAP,
    replaceTemplateName,
    resolveTemplateFn as resolveTemplateFunction,
} from "./filename";
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

interface DeclarationInfo {
    bindings: t.Identifier[];
    children: t.Node[];
    decl: t.Declaration;
    deps: Dep[];
    params: TypeParams;
    resolvedModuleId?: string;
}

type NamespaceMap = Map<string, { local: t.Identifier | t.TSQualifiedName; stmt: t.Statement }>;

const createFakeJsPlugin = ({ cjsDefault, sideEffects, sourcemap }: Pick<OptionsResolved, "sourcemap" | "cjsDefault" | "sideEffects">): Plugin => {
    let declarationIndex = 0;
    const declarationMap = new Map<number /* declaration id */, DeclarationInfo>();
    const commentsMap = new Map<string /* filename */, t.Comment[]>();
    const typeOnlyMap = new Map<string, string[]>();

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

                    specifier = filename_dts_to(specifier, "js");

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
                        const renderedNameWithoutD = filename_js_to_dts(replaceTemplateName(nameTemplate, chunk.name.slice(0, -2)));

                        if (RE_DTS.test(renderedNameWithoutD)) {
                            return renderedNameWithoutD;
                        }

                        const renderedName = filename_js_to_dts(replaceTemplateName(nameTemplate, chunk.name));

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

            return transform.call(this as unknown as TransformPluginContext, code, id);
        },
    };

    async function transform(this: TransformPluginContext, code: string, id: string): Promise<TransformResult> {
        const identifierMap: Record<string, number> = Object.create(null);

        const file = parse(code, {
            createParenthesizedExpressions: true,
            errorRecovery: true,
            plugins: [["typescript", { dts: true }]],
            sourceType: "module",
        });
        const { comments, program } = file;
        const typeOnlyIds: string[] = [];

        if (comments) {
            const directives = collectReferenceDirectives(comments);

            commentsMap.set(id, directives);
        }

        const appendStmts: t.Statement[] = [];
        const namespaceStmts: NamespaceMap = new Map();

        for (const [i, stmt] of program.body.entries()) {
            const setStmt = (stmt: t.Statement) => (program.body[i] = stmt);

            if (rewriteImportExport(stmt, setStmt, typeOnlyIds))
                continue;

            const sideEffect = stmt.type === "TSModuleDeclaration" && stmt.kind !== "namespace";

            // Resolve local `declare module './foo'` targets so that specifiers
            // can be rewritten to point to the correct output chunk.
            let resolvedModuleId: string | undefined;

            if (sideEffect && stmt.id.type === "StringLiteral") {
                const resolved = await this.resolve((stmt.id as t.StringLiteral).value, id);

                if (resolved && !resolved.external) {
                    resolvedModuleId = RE_DTS.test(resolved.id) ? resolved.id : filename_to_dts(resolved.id);
                } else if ((stmt.id as t.StringLiteral).value[0] === ".") {
                    this.warn(
                        `\`declare module ${JSON.stringify((stmt.id as t.StringLiteral).value)}\` will be kept as-is in the output. Relative module declaration may cause unexpected issues. Found in ${id}.`,
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
                    binding = getIdFromTSEntityName(binding as unknown as t.TSEntityName) as unknown as typeof binding;
                }

                binding = sideEffect ? t.identifier(`_${getIdentifierIndex(identifierMap, "")}`) : (binding as t.Identifier);
                bindings.push(binding as t.Identifier);
            } else {
                const binding = t.identifier("export_default");

                bindings.push(binding);
                // @ts-expect-error
                decl.id = binding;
            }

            const params: TypeParams = collectParams(decl);

            const childrenSet = new Set<t.Node>();
            const deps = collectDependencies(decl, namespaceStmts, childrenSet, identifierMap);
            const children = [...childrenSet].filter((child) => bindings.every((b) => child !== b));

            if (decl !== stmt) {
                decl.leadingComments = stmt.leadingComments;
            }

            const declarationId = registerDeclaration({
                bindings,
                children,
                decl,
                deps,
                params,
                resolvedModuleId,
            });

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

        program.body = [...Array.from(namespaceStmts.values(), ({ stmt }) => stmt), ...program.body, ...appendStmts];

        typeOnlyMap.set(id, typeOnlyIds);

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

        const typeOnlyIds: string[] = [];

        for (const module of chunk.moduleIds) {
            const ids = typeOnlyMap.get(module);

            if (ids)
                typeOnlyIds.push(...ids);
        }

        const file = parse(code, {
            sourceType: "module",
        });
        const { program } = file;

        program.body = patchTsNamespace(program.body);
        program.body = patchReExport(program.body);

        program.body = program.body
            .map((node) => {
                if (isHelperImport(node))
                    return null;

                if (node.type === "ExpressionStatement")
                    return null;

                const newNode = patchImportExport(node, typeOnlyIds, cjsDefault);

                if (newNode || newNode === false) {
                    return newNode;
                }

                if (node.type !== "VariableDeclaration")
                    return node;

                if (!isRuntimeBindingVariableDeclaration(node)) {
                    return null;
                }

                const [declarationIdNode, depsFunction, children] = node.declarations[0].init.elements;

                const declarationId = declarationIdNode.value;
                const declaration = getDeclaration(declarationId);

                walkAST<t.Node | t.Comment>(declaration.decl, {
                    enter(node) {
                        if (node.type === "CommentBlock") {
                            return;
                        }

                        delete node.loc;
                    },
                });

                for (const [i, decl] of node.declarations.entries()) {
                    const transformedBinding = {
                        ...decl.id,
                        typeAnnotation: declaration.bindings[i].typeAnnotation,
                    };

                    overwriteNode(declaration.bindings[i], transformedBinding);
                }

                for (const [i, child] of (children.elements as t.StringLiteral[]).entries()) {
                    Object.assign(declaration.children[i], {
                        loc: child.loc,
                    });
                }

                const transformedParams = depsFunction.params as t.Identifier[];

                for (const [i, transformedParameter] of transformedParams.entries()) {
                    const transformedName = transformedParameter.name;

                    for (const originalTypeParameter of declaration.params[i].typeParams) {
                        originalTypeParameter.name = transformedName;
                    }
                }

                const transformedDeps = (depsFunction.body as t.ArrayExpression).elements as t.Expression[];

                for (let i = 0; i < declaration.deps.length; i++) {
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

                return inheritNodeComments(node, declaration.decl);
            })
            .filter((node) => !!node);

        if (program.body.length === 0) {
            return "export { };";
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
                    inferred.push(node.typeParameter.name as string);
                }
            },
        });

        return inferred;
    }

    function collectDependencies(node: t.Node, namespaceStmts: NamespaceMap, children: Set<t.Node>, identifierMap: Record<string, number>): Dep[] {
        const deps = new Set<Dep>();
        const seen = new Set<t.Node>();

        const inferredStack: string[][] = [];
        let currentInferred = new Set<string>();

        function isInferred(node: t.Node): boolean {
            return node.type === "Identifier" && currentInferred.has((node as t.Identifier).name);
        }

        walkAST(node, {
            enter(node) {
                if (node.type === "TSConditionalType") {
                    const inferred = collectInferredNames(node.extendsType);

                    inferredStack.push(inferred);
                }
            },
            leave(node, parent) {
                if (node.type === "TSConditionalType") {
                    inferredStack.pop();
                } else if (parent?.type === "TSConditionalType") {
                    const trueBranch = (parent as t.TSConditionalType).trueType === node;

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
                } else if (isTypeOf(node, ["ObjectMethod", "ObjectProperty", "ClassProperty", "TSPropertySignature", "TSDeclareMethod"])) {
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
                            const dep = importNamespace(node, imported, source, namespaceStmts, identifierMap);

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
        imported: t.TSEntityName | null | undefined,
        source: t.StringLiteral,
        namespaceStmts: NamespaceMap,
        identifierMap: Record<string, number>,
    ): Dep {
        const sourceText = source.value.replaceAll(/\W/g, "_");
        const localName = isIdentifierName(source.value) ? source.value : `${sourceText}${getIdentifierIndex(identifierMap, sourceText)}`;
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

    if (isTypeOf(parent, ["TSPropertySignature", "TSMethodSignature"]) && (parent as t.TSPropertySignature | t.TSMethodSignature).key === node)
        return true;

    return false;
}

const REFERENCE_RE = /\/\s*<reference\s+(?:path|types)=/;

const collectReferenceDirectives = (comment: t.Comment[], negative = false) => comment.filter((c) => REFERENCE_RE.test(c.value) !== negative);

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
const patchImportExport = (node: t.Node, typeOnlyIds: string[], cjsDefault: boolean): t.Statement | false | undefined => {
    if (node.type === "ExportNamedDeclaration" && !node.declaration && !node.source && node.specifiers.length === 0 && !node.attributes?.length) {
        return false;
    }

    if (isTypeOf(node, ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"])) {
        if (node.type === "ExportNamedDeclaration" && typeOnlyIds.length > 0) {
            for (const spec of node.specifiers) {
                const name = resolveString(spec.exported);

                if (typeOnlyIds.includes(name)) {
                    if (spec.type === "ExportSpecifier") {
                        spec.exportKind = "type";
                    } else {
                        node.exportKind = "type";
                    }
                }
            }
        }

        if (node.source?.value && RE_DTS.test(node.source.value)) {
            node.source.value = filename_dts_to(node.source.value, "js");

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
            const defaultExport = node.specifiers[0] as t.ExportSpecifier;

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

        if ((exports as t.ObjectExpression).properties.length === 0)
            continue;

        nodes[i] = {
            body: {
                body: [
                    {
                        declaration: null,
                        source: null,
                        specifiers: (exports as t.ObjectExpression).properties.filter((property) => property.type === "ObjectProperty").map((property) => {
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
    typeOnlyIds: string[],
): node is t.ImportDeclaration | t.ExportAllDeclaration | t.TSImportEqualsDeclaration => {
    if (node.type === "ImportDeclaration" || (node.type === "ExportNamedDeclaration" && !node.declaration)) {
        for (const specifier of node.specifiers) {
            if (("exportKind" in specifier && specifier.exportKind === "type") || ("exportKind" in node && node.exportKind === "type")) {
                typeOnlyIds.push(resolveString((specifier as t.ExportSpecifier | t.ExportDefaultSpecifier | t.ExportNamespaceSpecifier).exported));
            }

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
