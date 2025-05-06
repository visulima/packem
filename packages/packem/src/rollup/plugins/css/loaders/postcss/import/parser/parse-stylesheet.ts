/**
 * Modified copy of https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-bundler/src/postcss-import/lib/parse-stylesheet.ts
 *
 * MIT No Attribution (MIT-0)
 * Copyright © CSSTools Contributors
 */
import type { AtRule, ChildNode, Document, Result, Root, Warning } from "postcss";

import { IS_CHARSET_REGEX, IS_IMPORT_REGEX, IS_LAYER_REGEX } from "../constants";
import type { Condition, ImportStatement, Statement, Stylesheet } from "../types";
import parseAtImport from "./parse-at-import";

const consumeComments = (nodes: ChildNode[], cursor: number, importingNode: AtRule | null, from: string[]): [number, Statement] => {
    const comments: ChildNode[] = [];

    let index = cursor;

    const l = nodes.length;

    // eslint-disable-next-line no-plusplus
    for (index; index < l; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const node = nodes[index] as ChildNode;

        comments.push(node);

        const next = nodes[index + 1];

        if (next?.type === "comment") {
            // eslint-disable-next-line no-continue
            continue;
        }

        break;
    }

    return [
        index,
        {
            conditions: [],
            from,
            importingNode,
            nodes: comments,
            type: "nodes",
        },
    ];
};
const parseImport = (result: Result, atRule: AtRule, importingNode: AtRule | null, conditions: Condition[], from: string[]): Warning | ImportStatement => {
    const parsed = parseAtImport(atRule.params);

    if (!parsed) {
        return result.warn(`Invalid @import statement in '${atRule.toString()}'`, {
            node: atRule,
        });
    }

    const stmt: ImportStatement = {
        conditions: [...conditions],
        from,
        fullUri: parsed.fullUri,
        importingNode,
        node: atRule,
        type: "import",
        uri: parsed.uri,
    };

    if (parsed.layer !== undefined || parsed.media !== undefined || parsed.supports !== undefined || parsed.scope !== undefined) {
        stmt.conditions.push({
            layer: parsed.layer,
            media: parsed.media,
            scope: parsed.scope,
            supports: parsed.supports,
        });
    }

    return stmt;
};

const consumeImports = (
    result: Result,
    nodes: ChildNode[],
    conditions: Condition[],
    cursor: number,
    importingNode: AtRule | null,
    from: string[],
): [number, Statement[]] => {
    const statements: Statement[] = [];

    let index = cursor;

    const l = nodes.length;

    // eslint-disable-next-line no-plusplus
    for (index; index < l; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const node = nodes[index] as ChildNode;

        if (node.type === "comment") {
            const [consumeIndex, commentsStmt] = consumeComments(nodes, index, importingNode, from);
            statements.push(commentsStmt);

            index = consumeIndex;
            // eslint-disable-next-line no-continue
            continue;
        }

        if (node.type === "atrule" && IS_IMPORT_REGEX.test(node.name)) {
            statements.push(parseImport(result, node, importingNode, conditions, from));
            // eslint-disable-next-line no-continue
            continue;
        }

        break;
    }

    return [index - 1, statements];
};

const consumeLayers = (nodes: ChildNode[], conditions: Condition[], cursor: number, importingNode: AtRule | null, from: string[]): [number, Statement] => {
    const layers: ChildNode[] = [];

    let index = cursor;
    const l = nodes.length;

    // eslint-disable-next-line no-plusplus
    for (index; index < l; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const node = nodes[index] as ChildNode;

        layers.push(node);

        const next = nodes[index + 1];

        if (next && next.type === "atrule" && IS_LAYER_REGEX.test(next.name) && !next.nodes) {
            // eslint-disable-next-line no-continue
            continue;
        }

        break;
    }

    return [
        index,
        {
            conditions: [...conditions],
            from,
            importingNode,
            nodes: layers,
            type: "nodes",
        },
    ];
};

const consumeBeforeImports = (
    nodes: ChildNode[],
    conditions: Condition[],
    cursor: number,
    importingNode: AtRule | null,
    from: string[],
): [number, Statement[]] => {
    const statements: Statement[] = [];

    let index = cursor;

    const l = nodes.length;

    // eslint-disable-next-line no-plusplus
    for (index; index < l; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const node = nodes[index] as ChildNode;

        if (node.type === "comment") {
            const [consumeIndex, commentsStmt] = consumeComments(nodes, index, importingNode, from);

            statements.push(commentsStmt);

            index = consumeIndex;

            // eslint-disable-next-line no-continue
            continue;
        }

        if (node.type === "atrule" && IS_LAYER_REGEX.test(node.name) && !node.nodes) {
            if (conditions.length > 0) {
                statements.push({
                    conditions: [...conditions],
                    from,
                    importingNode,
                    node,
                    type: "pre-import",
                });

                // eslint-disable-next-line no-continue
                continue;
            } else {
                const [consumeIndex, layerStmt] = consumeLayers(nodes, conditions, index, importingNode, from);

                statements.push(layerStmt);

                index = consumeIndex;
                // eslint-disable-next-line no-continue
                continue;
            }
        }

        break;
    }

    return [index - 1, statements];
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const parseStylesheet = (result: Result, styles: Root | Document, importingNode: AtRule | null, conditions: Condition[], from: string[]): Stylesheet => {
    const stylesheet: Stylesheet = {
        statements: [],
    };

    if (styles.type === "document") {
        styles.each((root) => {
            const subStylesheet = parseStylesheet(result, root, importingNode, conditions, from);

            if (stylesheet.charset && subStylesheet.charset && stylesheet.charset.params.toLowerCase() !== subStylesheet.charset.params.toLowerCase()) {
                throw subStylesheet.charset.error(
                    "Incompatible @charset statements:\n" +
                         
                        `  ${subStylesheet.charset.params} specified in ${subStylesheet.charset.source?.input.file}\n` +
                         
                        `  ${stylesheet.charset.params} specified in ${stylesheet.charset.source?.input.file}`,
                );
            } else if (!stylesheet.charset && !!subStylesheet.charset) {
                stylesheet.charset = subStylesheet.charset;
            }

            stylesheet.statements.push(...subStylesheet.statements);
        });

        return stylesheet;
    }

    let charset: AtRule | undefined;
    let beforeImports: Statement[] = [];
    let imports: Statement[] = [];
    let afterImports: Statement | undefined;

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < styles.nodes.length; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const node = styles.nodes[index] as ChildNode;

        if (index === 0 && node.type === "atrule" && IS_CHARSET_REGEX.test(node.name)) {
            charset = node;

            // eslint-disable-next-line no-continue
            continue;
        }

        if (imports.length === 0 && (node.type === "comment" || (node.type === "atrule" && IS_LAYER_REGEX.test(node.name) && !node.nodes))) {
            [index, beforeImports] = consumeBeforeImports(styles.nodes, conditions, index, importingNode, from);
            // eslint-disable-next-line no-continue
            continue;
        }

        if (imports.length === 0 && node.type === "atrule" && IS_IMPORT_REGEX.test(node.name)) {
            [index, imports] = consumeImports(result, styles.nodes, conditions, index, importingNode, from);
            // eslint-disable-next-line no-continue
            continue;
        }

        afterImports = {
            conditions: [...conditions],
            from,
            importingNode,
            nodes: styles.nodes.slice(index),
            type: "nodes",
        };

        break;
    }

    const statements: Statement[] = [];

    if (beforeImports.length > 0) {
        statements.push(...beforeImports);
    }

    if (imports.length > 0) {
        statements.push(...imports);
    }

    if (afterImports) {
        statements.push(afterImports);
    }

    return {
        charset,
        statements,
    };
};

export default parseStylesheet;
