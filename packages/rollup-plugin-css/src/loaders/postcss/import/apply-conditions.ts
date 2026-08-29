/**
 * Modified copy of https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-bundler/src/postcss-import/lib/apply-conditions.ts
 *
 * MIT No Attribution (MIT-0)
 * Copyright © CSSTools Contributors
 */
import type { AtRule, AtRuleProps } from "postcss";

import type { Stylesheet } from "./types";
import base64EncodedConditionalImport from "./utils/base64-encoded-import";
import { isImportStatement, isPreImportStatement, isWarning } from "./utils/statement";

const applyConditions = (stylesheet: Stylesheet, atRule: (defaults?: AtRuleProps) => AtRule): void => {
    stylesheet.statements.forEach((statement, index) => {
        if (isWarning(statement) || isPreImportStatement(statement) || statement.conditions.length === 0) {
            return;
        }

        if (isImportStatement(statement)) {
            // eslint-disable-next-line no-param-reassign
            statement.node.params = base64EncodedConditionalImport(statement.fullUri, statement.conditions);

            return;
        }

        const { nodes } = statement;

        if (nodes.length === 0) {
            return;
        }

        const { parent } = nodes[0] as AtRule;

        if (!parent) {
            return;
        }

        const atRules = [];

        // Convert conditions to at-rules
        for (const condition of statement.conditions) {
            if (condition.media !== undefined) {
                const mediaNode = atRule({
                    name: "media",
                    params: condition.media,
                    source: statement.importingNode?.source ?? parent.source,
                });

                atRules.push(mediaNode);
            }

            if (condition.scope !== undefined) {
                const scopeNode = atRule({
                    name: "scope",
                    params: condition.scope,
                    source: statement.importingNode?.source ?? parent.source,
                });

                atRules.push(scopeNode);
            }

            if (condition.supports !== undefined) {
                const supportsNode = atRule({
                    name: "supports",
                    params: `(${condition.supports})`,
                    source: statement.importingNode?.source ?? parent.source,
                });

                atRules.push(supportsNode);
            }

            if (condition.layer !== undefined) {
                const layerNode = atRule({
                    name: "layer",
                    params: condition.layer,
                    source: statement.importingNode?.source ?? parent.source,
                });

                atRules.push(layerNode);
            }
        }

        // Add nodes to AST
        const outerAtRule = atRules[0];

        if (!outerAtRule) {
            return;
        }

        // eslint-disable-next-line no-plusplus
        for (let atRulesIndex = 0; atRulesIndex < atRules.length - 1; atRulesIndex++) {
            (atRules[atRulesIndex] as AtRule).append(atRules[atRulesIndex + 1]);
        }

        const innerAtRule = atRules.at(-1) as AtRule;

        parent.insertBefore(nodes[0] as AtRule, outerAtRule);

        // remove nodes
        nodes.forEach((node) => {
            // eslint-disable-next-line no-param-reassign
            node.parent = undefined;
        });

        // wrap new rules with media query and/or layer at rule
        innerAtRule.append(nodes);

        // eslint-disable-next-line no-param-reassign
        stylesheet.statements[index] = {
            conditions: statement.conditions,
            from: statement.from,
            importingNode: statement.importingNode,
            nodes: [outerAtRule],
            type: "nodes",
        };
    });
};

export default applyConditions;
