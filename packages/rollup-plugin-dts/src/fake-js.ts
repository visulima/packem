import _generate from "@babel/generator";
import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { isDeclarationType, isTypeOf, resolveString } from "ast-kit";
import { walk } from "estree-walker";
import type { Plugin, RenderedChunk } from "rolldown";

import {
    filename_dts_to,
    filename_js_to_dts,
    RE_DTS,
    RE_DTS_MAP,
    replaceTemplateName,
    resolveTemplateFn as resolveTemplateFunction,
} from "./filename";
import type { OptionsResolved } from "./options";

const generate: typeof _generate.default
    = (_generate.default as any) || _generate;

// input:
// export declare function x(xx: X): void

// to:            const x   = [1, () => X  ]
// after compile: const x$1 = [1, () => X$1]

// replace X with X$1
// output:
// export declare function x$1(xx: X$1): void

type Dep = t.Expression & { replace?: (newNode: t.Node) => void };
interface SymbolInfo {
    bindings: t.Identifier[];
    decl: t.Declaration;
    deps: Dep[];
}

type NamespaceMap = Map<
    string,
    { local: t.Identifier | t.TSQualifiedName; stmt: t.Statement }
>;

export function createFakeJsPlugin({
    cjsDefault,
    sourcemap,
}: Pick<OptionsResolved, "sourcemap" | "cjsDefault">): Plugin {
    let symbolIndex = 0;
    const identifierMap: Record<string, number> = Object.create(null);
    const symbolMap = new Map<number /* symbol id */, SymbolInfo>();
    const commentsMap = new Map<string /* filename */, t.Comment[]>();
    const typeOnlyMap = new Map<string, string[]>();

    return {
        generateBundle: sourcemap
            ? undefined
            : (options, bundle) => {
                for (const chunk of Object.values(bundle)) {
                    if (!RE_DTS_MAP.test(chunk.fileName)) { continue; }

                    delete bundle[chunk.fileName];
                }
            },

        name: "rolldown-plugin-dts:fake-js",

        outputOptions(options) {
            if (options.format === "cjs" || options.format === "commonjs") {
                throw new Error(
                    "[rolldown-plugin-dts] Cannot bundle dts files with `cjs` format.",
                );
            }

            const { chunkFileNames } = options;

            return {
                ...options,
                chunkFileNames(chunk) {
                    const nameTemplate = resolveTemplateFunction(
                        chunkFileNames || "[name]-[hash].js",
                        chunk,
                    );

                    if (chunk.name.endsWith(".d")) {
                        const renderedNameWithoutD = filename_js_to_dts(
                            replaceTemplateName(nameTemplate, chunk.name.slice(0, -2)),
                        );

                        if (RE_DTS.test(renderedNameWithoutD)) {
                            return renderedNameWithoutD;
                        }

                        const renderedName = filename_js_to_dts(
                            replaceTemplateName(nameTemplate, chunk.name),
                        );

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

        transform: {
            filter: { id: RE_DTS },
            handler: transform,
        },
    };

    function transform(code: string, id: string) {
        const file = parse(code, {
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

        for (const [index, stmt] of program.body.entries()) {
            const setStmt = (node: t.Node) => (program.body[index] = node as any);

            if (rewriteImportExport(stmt, setStmt, typeOnlyIds)) { continue; }

            const sideEffect
                = stmt.type === "TSModuleDeclaration" && stmt.kind !== "namespace";

            if (
                sideEffect
                && id.endsWith(".vue.d.ts")
                && code.slice(stmt.start!, stmt.end!).includes("__VLS_")
            ) {
                continue;
            }

            const isDefaultExport = stmt.type === "ExportDefaultDeclaration";
            const isDecl
                = isTypeOf(stmt, [
                    "ExportNamedDeclaration",
                    "ExportDefaultDeclaration",
                ]) && stmt.declaration;

            const decl: t.Node = isDecl ? stmt.declaration! : stmt;
            const setDecl = isDecl
                ? (node: t.Node) => (stmt.declaration = node as any)
                : setStmt;

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
                bindings.push(
                    ...decl.declarations.map((decl) => decl.id as t.Identifier),
                );
            } else if ("id" in decl && decl.id) {
                let binding = decl.id;

                binding = sideEffect
                    ? t.identifier(`_${getIdentifierIndex("")}`)
                    : (binding as t.Identifier);
                bindings.push(binding);
            } else {
                const binding = t.identifier("export_default");

                bindings.push(binding);
                // @ts-expect-error
                decl.id = binding;
            }

            const deps = collectDependencies(decl, namespaceStmts);

            const elements: t.Expression[] = [
                t.numericLiteral(0),
                ...deps.map((dep) => t.arrowFunctionExpression([], dep)),
                ...sideEffect
                    ? [t.callExpression(t.identifier("sideEffect"), [bindings[0]])]
                    : [],
            ];
            const runtime: t.ArrayExpression = t.arrayExpression(elements);

            if (decl !== stmt) {
                decl.innerComments = stmt.innerComments;
                decl.leadingComments = stmt.leadingComments;
                decl.trailingComments = stmt.trailingComments;
            }

            const symbolId = registerSymbol({
                bindings,
                decl,
                deps,
            });

            elements[0] = t.numericLiteral(symbolId);

            // var ${binding} = [${symbolId}, () => ${dep}, ..., sideEffect()]
            const runtimeAssignment: t.VariableDeclaration = {
                declarations: [
                    {
                        id: { ...bindings[0], typeAnnotation: null },
                        init: runtime,
                        type: "VariableDeclarator",
                    },
                    ...bindings.slice(1).map(
                        (binding): t.VariableDeclarator => {
                            return {
                                id: { ...binding, typeAnnotation: null },
                                type: "VariableDeclarator",
                            };
                        },
                    ),
                ],
                kind: "var",
                type: "VariableDeclaration",
            };

            if (isDefaultExport) {
                // export { ${binding} as default }
                appendStmts.push(
                    t.exportNamedDeclaration(null, [
                        t.exportSpecifier(bindings[0], t.identifier("default")),
                    ]),
                );
                // replace the whole statement
                setStmt(runtimeAssignment);
            } else {
                // replace declaration, keep `export`
                setDecl(runtimeAssignment);
            }
        }

        program.body = [
            ...[...namespaceStmts.values()].map(({ stmt }) => stmt),
            ...program.body,
            ...appendStmts,
        ];

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

            if (ids) { typeOnlyIds.push(...ids); }
        }

        const file = parse(code, {
            sourceType: "module",
        });
        const { program } = file;

        program.body = patchTsNamespace(program.body);

        program.body = program.body
            .map((node) => {
                if (isHelperImport(node)) { return null; }

                const newNode = patchImportExport(node, typeOnlyIds, cjsDefault);

                if (newNode) {
                    return newNode;
                }

                if (node.type !== "VariableDeclaration") { return node; }

                const [decl] = node.declarations;

                if (decl.init?.type !== "ArrayExpression" || !decl.init.elements[0]) {
                    return null;
                }

                const [symbolIdNode, ...depsFns] = decl.init.elements as t.Expression[];

                if (symbolIdNode?.type !== "NumericLiteral") {
                    return null;
                }

                const symbolId = symbolIdNode.value;
                const original = getSymbol(symbolId);

                for (const [index, decl] of node.declarations.entries()) {
                    const transformedBinding = {
                        ...decl.id,
                        typeAnnotation: original.bindings[index].typeAnnotation,
                    };

                    overwriteNode(original.bindings[index], transformedBinding);
                }

                const transformedDeps = depsFns
                    .filter((node) => node?.type === "ArrowFunctionExpression")
                    .map((node) => node.body);

                if (original.deps.length > 0) {
                    for (let index = 0; index < original.deps.length; index++) {
                        const originalDep = original.deps[index];

                        if (originalDep.replace) {
                            originalDep.replace(transformedDeps[index]);
                        } else {
                            Object.assign(originalDep, transformedDeps[index]);
                        }
                    }
                }

                return inheritNodeComments(node, original.decl);
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

                    if (commentsValue.has(id)) { return; }

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

    function getIdentifierIndex(name: string) {
        if (name in identifierMap) {
            return identifierMap[name]++;
        }

        return (identifierMap[name] = 0);
    }

    function registerSymbol(info: SymbolInfo) {
        const symbolId = symbolIndex++;

        symbolMap.set(symbolId, info);

        return symbolId;
    }

    function getSymbol(symbolId: number) {
        return symbolMap.get(symbolId)!;
    }

    function collectDependencies(
        node: t.Node,
        namespaceStmts: NamespaceMap,
    ): Dep[] {
        const deps = new Set<Dep>();
        const seen = new Set<t.Node>()

    ;(walk as any)(node, {
            leave(node: t.Node) {
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
                    if (node.superClass) { addDependency(node.superClass); }

                    if (node.implements) {
                        for (const implement of node.implements) {
                            addDependency(
                                TSEntityNameToRuntime(
                                    (implement as t.TSExpressionWithTypeArguments).expression,
                                ),
                            );
                        }
                    }
                } else if (
                    isTypeOf(node, [
                        "ObjectMethod",
                        "ObjectProperty",
                        "ClassProperty",
                        "TSPropertySignature",
                        "TSDeclareMethod",
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
                            const source = node.argument;
                            const imported = node.qualifier;
                            const dep = importNamespace(node, imported, source, namespaceStmts);

                            addDependency(dep);

                            break;
                        }
                        case "TSTypeQuery": {
                            if (seen.has(node.exprName)) { return; }

                            if (node.exprName.type !== "TSImportType") {
                                addDependency(TSEntityNameToRuntime(node.exprName));
                            }

                            break;
                        }
                        case "TSTypeReference": {
                            addDependency(TSEntityNameToRuntime(node.typeName));

                            break;
                        }
 // No default
                    }
                }
            },
        });

        return [...deps];

        function addDependency(node: Dep) {
            if (node.type === "Identifier" && node.name === "this") { return; }

            deps.add(node);
        }
    }

    function importNamespace(
        node: t.TSImportType,
        imported: t.TSEntityName | null | undefined,
        source: t.StringLiteral,
        namespaceStmts: NamespaceMap,
    ): Dep {
        const sourceText = source.value.replaceAll(/\W/g, "_");
        let local: t.Identifier | t.TSQualifiedName = t.identifier(
            `${sourceText}${getIdentifierIndex(sourceText)}`,
        );

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
}

// function debug(node: t.Node) {
//   console.info('----')
//   console.info(generate(node).code)
//   console.info('----')
// }

const REFERENCE_RE = /\/\s*<reference\s+(?:path|types)=/;

function collectReferenceDirectives(comment: t.Comment[], negative = false) {
    return comment.filter((c) => REFERENCE_RE.test(c.value) !== negative);
}

function TSEntityNameToRuntime(
    node: t.TSEntityName,
): t.MemberExpression | t.Identifier {
    if (node.type === "Identifier") {
        return node;
    }

    const left = TSEntityNameToRuntime(node.left);

    return Object.assign(node, t.memberExpression(left, node.right));
}

function getIdFromTSEntityName(node: t.TSEntityName) {
    if (node.type === "Identifier") {
        return node;
    }

    return getIdFromTSEntityName(node.left);
}

function isReferenceId(
    node?: t.Node | null,
): node is t.Identifier | t.MemberExpression {
    return (
        !!node && (node.type === "Identifier" || node.type === "MemberExpression")
    );
}

function isHelperImport(node: t.Node) {
    return (
        node.type === "ImportDeclaration"
        && node.specifiers.length === 1
        && node.specifiers.every(
            (spec) =>
                spec.type === "ImportSpecifier"
                && spec.imported.type === "Identifier"
                && ["__export", "__reExport"].includes(spec.imported.name),
        )
    );
}

// patch `.d.ts` suffix in import source to `.js`
function patchImportExport(
    node: t.Node,
    typeOnlyIds: string[],
    cjsDefault: boolean,
): t.Statement | undefined {
    if (
        isTypeOf(node, [
            "ImportDeclaration",
            "ExportAllDeclaration",
            "ExportNamedDeclaration",
        ])
    ) {
        if (typeOnlyIds.length > 0 && node.type === "ExportNamedDeclaration") {
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
}

function patchTsNamespace(nodes: t.Statement[]) {
    const emptyObjectAssignments = new Map<string, t.VariableDeclaration>();
    const removed = new Set<t.Node>();

    for (const [index, node] of nodes.entries()) {
        if (
            node.type === "VariableDeclaration"
            && node.declarations.length === 1
            && node.declarations[0].id.type === "Identifier"
            && node.declarations[0].init?.type === "ObjectExpression"
            && node.declarations[0].init.properties.length === 0
        ) {
            emptyObjectAssignments.set(node.declarations[0].id.name, node);
        }

        if (
            node.type !== "ExpressionStatement"
            || node.expression.type !== "CallExpression"
            || node.expression.callee.type !== "Identifier"
            || !node.expression.callee.name.startsWith("__export")
        ) {
            continue;
        }

        const [binding, exports] = node.expression.arguments;

        if (binding.type !== "Identifier") { continue; }

        const bindingText = binding.name;

        if (emptyObjectAssignments.has(bindingText)) {
            const emptyNode = emptyObjectAssignments.get(bindingText)!;

            emptyObjectAssignments.delete(bindingText);
            removed.add(emptyNode);
        }

        nodes[index] = {
            body: {
                body: [
                    {
                        declaration: null,
                        source: null,
                        specifiers: (exports as t.ObjectExpression).properties.filter((property) => property.type === "ObjectProperty").map((property) => {
                            const local = (property.value as t.ArrowFunctionExpression)
                                .body as t.Identifier;
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
}

// fix:
// - import type { ... } from '...'
// - import { type ... } from '...'
// - export type { ... }
// - export { type ... }
// - export type * as x '...'
// - import Foo = require("./bar")
// - export = Foo
// - export default x
function rewriteImportExport(
    node: t.Node,
    set: (node: t.Node) => void,
    typeOnlyIds: string[],
): node is
| t.ImportDeclaration
| t.ExportAllDeclaration
| t.TSImportEqualsDeclaration {
    if (
        node.type === "ImportDeclaration"
        || (node.type === "ExportNamedDeclaration" && !node.declaration)
    ) {
        for (const specifier of node.specifiers) {
            if (
                ("exportKind" in specifier && specifier.exportKind === "type")
                || ("exportKind" in node && node.exportKind === "type")
            ) {
                typeOnlyIds.push(
                    resolveString(
                        (
                            specifier as
                            | t.ExportSpecifier
                            | t.ExportDefaultSpecifier
                            | t.ExportNamespaceSpecifier
                        ).exported,
                    ),
                );
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

    if (
        node.type === "TSExportAssignment"
        && node.expression.type === "Identifier"
    ) {
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

    if (
        node.type === "ExportDefaultDeclaration"
        && node.declaration.type === "Identifier"
    ) {
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
}

function overwriteNode<T>(node: t.Node, newNode: T): T {
    // clear object keys
    for (const key of Object.keys(node)) {
        delete (node as any)[key];
    }

    Object.assign(node, newNode);

    return node as T;
}

function inheritNodeComments<T extends t.Node>(oldNode: t.Node, newNode: T): T {
    newNode.leadingComments ||= [];

    const leadingComments = oldNode.leadingComments?.filter((comment) =>
        comment.value.startsWith("#"),
    );

    if (leadingComments) {
        newNode.leadingComments.unshift(...leadingComments);
    }

    newNode.leadingComments = collectReferenceDirectives(
        newNode.leadingComments,
        true,
    );

    newNode.trailingComments = newNode.trailingComments?.filter(
        (comment) => !comment.value.startsWith("# sourceMappingURL"),
    );

    return newNode;
}
