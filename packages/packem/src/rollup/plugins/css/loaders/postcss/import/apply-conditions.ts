import type { AtRule, AtRuleProps, Document, Root } from "postcss";

import type { Statement } from "./types";
import base64EncodedConditionalImport from "./utils/base64-encoded-import";

const applyConditions = (bundle: Statement[], atRule: (defaults?: AtRuleProps) => AtRule): void => {
    bundle.forEach((stmt) => {
        if (stmt.type === "charset" || stmt.type === "warning" || stmt.conditions.length === 0) {
            return;
        }

        if (stmt.type === "import") {
            // eslint-disable-next-line no-param-reassign
            stmt.node.params = base64EncodedConditionalImport(stmt.fullUri as string, stmt.conditions);
            return;
        }

        const { nodes } = stmt;
        const { parent } = (nodes as Root[])[0] as Root;

        const atRules = [];

        // Convert conditions to at-rules
        for (const condition of stmt.conditions) {
            if (condition.media !== undefined) {
                const mediaNode = atRule({
                    name: "media",
                    params: condition.media,
                    source: (parent as Document).source,
                });

                atRules.push(mediaNode);
            }

            if (condition.supports !== undefined) {
                const supportsNode = atRule({
                    name: "supports",
                    params: `(${condition.supports})`,
                    source: (parent as Document).source,
                });

                atRules.push(supportsNode);
            }

            if (condition.layer !== undefined) {
                const layerNode = atRule({
                    name: "layer",
                    params: condition.layer,
                    source: (parent as Document).source,
                });

                atRules.push(layerNode);
            }
        }

        // Add nodes to AST
        const outerAtRule: AtRule = atRules.shift() as AtRule;
        // eslint-disable-next-line unicorn/no-array-reduce
        const innerAtRule = atRules.reduce((previous, next) => {
            (previous as AtRule).append(next);

            return next;
        }, outerAtRule);

        (parent as Document).insertBefore((nodes as Root[])[0] as Root, outerAtRule);

        // remove nodes
        (nodes as Root[]).forEach((node) => {
            // eslint-disable-next-line no-param-reassign
            node.parent = undefined;
        });

        // better output
        ((nodes as Root[])[0] as Root).raws.before = ((nodes as Root[])[0] as Root).raws.before || "\n";

        // wrap new rules with media query and/or layer at rule
        (innerAtRule as AtRule).append(nodes);

        // eslint-disable-next-line no-param-reassign
        stmt.type = "nodes";
        // eslint-disable-next-line no-param-reassign
        stmt.nodes = [outerAtRule];

        // eslint-disable-next-line no-param-reassign
        stmt.node = undefined;
    });
};

export default applyConditions;
