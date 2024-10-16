import type { AtRule, ChildNode, Document, Helpers, Root, Warning } from "postcss";
import valueParser from "postcss-value-parser";

import type { Condition, ImportStatement, Statement } from "../types";

const parseCharset = (result: Helpers["result"], atRule: AtRule, conditions: Condition[], from: string | undefined): Warning | Statement => {
    if (atRule.prev()) {
        return result.warn("@charset must precede all other statements", {
            node: atRule,
        });
    }

    return {
        conditions: [...conditions],
        from,
        node: atRule,
        type: "charset",
    };
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const parseImport = (result: Helpers["result"], atRule: AtRule, conditions: Condition[], from: string | undefined): Warning | Statement => {
    let previous = atRule.prev();

    // `@import` statements may follow other `@import` statements.
    if (previous) {
        do {
            if (previous.type === "comment" || (previous.type === "atrule" && previous.name === "import")) {
                previous = previous.prev();
                // eslint-disable-next-line no-continue
                continue;
            }

            break;
        } while (previous);
    }

    // All `@import` statements may be preceded by `@charset` or `@layer` statements.
    // But the `@import` statements must be consecutive.
    if (previous) {
        do {
            if (
                previous.type === "comment" ||
                (previous.type === "atrule" && (previous.name === "charset" || (previous.name === "layer" && !previous.nodes)))
            ) {
                previous = previous.prev();
                // eslint-disable-next-line no-continue
                continue;
            }

            return result.warn("@import must precede all other statements (besides @charset or empty @layer)", { node: atRule });
        } while (previous);
    }

    if (atRule.nodes) {
        return result.warn("It looks like you didn't end your @import statement correctly. Child nodes are attached to it.", { node: atRule });
    }

    const parameters = valueParser(atRule.params).nodes;
    const stmt: Statement = {
        conditions: [...conditions],
        from,
        fullUri: "",
        node: atRule,
        type: "import",
        uri: "",
    };

    let layer;
    let media;
    let supports;

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < parameters.length; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const node = parameters[index] as valueParser.Node;

        if (node.type === "space" || node.type === "comment") {
            // eslint-disable-next-line no-continue
            continue;
        }

        if (node.type === "string") {
            if (stmt.uri) {
                return result.warn(`Multiple url's in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            if (!node.value) {
                return result.warn(`Unable to find uri in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            stmt.uri = node.value;
            stmt.fullUri = valueParser.stringify(node);

            // eslint-disable-next-line no-continue
            continue;
        }

        if (node.type === "function" && /^url$/i.test(node.value)) {
            if (stmt.uri) {
                return result.warn(`Multiple url's in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            if (Array.isArray(node.nodes) && !node.nodes[0]?.value) {
                return result.warn(`Unable to find uri in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            stmt.uri = node.nodes[0]?.value;
            stmt.fullUri = valueParser.stringify(node);

            // eslint-disable-next-line no-continue
            continue;
        }

        if (!stmt.uri) {
            return result.warn(`Unable to find uri in '${atRule.toString()}'`, {
                node: atRule,
            });
        }

        if ((node.type === "word" || node.type === "function") && /^layer$/i.test(node.value)) {
            if (layer !== undefined) {
                return result.warn(`Multiple layers in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            if (supports !== undefined) {
                return result.warn(`layers must be defined before support conditions in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            layer = "nodes" in node ? valueParser.stringify(node.nodes) : "";

            // eslint-disable-next-line no-continue
            continue;
        }

        if (node.type === "function" && /^supports$/i.test(node.value)) {
            if (supports !== undefined) {
                return result.warn(`Multiple support conditions in '${atRule.toString()}'`, {
                    node: atRule,
                });
            }

            supports = valueParser.stringify(node.nodes);

            // eslint-disable-next-line no-continue
            continue;
        }

        media = valueParser.stringify(parameters.slice(index));
        break;
    }

    if (!stmt.uri) {
        return result.warn(`Unable to find uri in '${atRule.toString()}'`, {
            node: atRule,
        });
    }

    if (media !== undefined || layer !== undefined || supports !== undefined) {
        stmt.conditions.push({
            layer,
            media,
            supports,
        });
    }

    return stmt as Statement;
};

const parseStatements = (
    result: Helpers["result"],
    styles: Root | Document,
    conditions: Condition[],
    from: string | undefined,
): (Warning | Statement | ImportStatement)[] => {
    const statements: (Warning | Statement)[] = [];
    let nodes: (Root | ChildNode)[] = [];

    styles.each((node) => {
        let stmt;

        if (node.type === "atrule") {
            if (node.name === "import") {
                stmt = parseImport(result, node, conditions, from);
            } else if (node.name === "charset") {
                stmt = parseCharset(result, node, conditions, from);
            }
        }

        if (stmt) {
            if (nodes.length > 0) {
                statements.push({
                    conditions: [...conditions],
                    from,
                    nodes,
                    type: "nodes",
                } satisfies Statement);

                nodes = [];
            }

            statements.push(stmt);
        } else nodes.push(node);
    });

    if (nodes.length > 0) {
        statements.push({
            conditions: [...conditions],
            from,
            nodes,
            type: "nodes",
        } satisfies Statement);
    }

    return statements;
};

export default parseStatements;
