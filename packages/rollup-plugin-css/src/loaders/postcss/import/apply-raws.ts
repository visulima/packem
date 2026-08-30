import type { ChildNode } from "postcss";

import type { ImportStatement, NodesStatement, PreImportStatement, Stylesheet } from "./types";
import { isNodesStatement } from "./utils/statement";

const applyRaws = (stylesheet: Stylesheet): void => {
    stylesheet.statements.forEach((statement, index) => {
        if (index === 0) {
            return;
        }

        if ((statement as ImportStatement | NodesStatement | PreImportStatement).parent !== undefined) {
            const parent = (statement as ImportStatement | PreImportStatement).parent as ImportStatement | PreImportStatement;
            const { raws: parentRaws } = parent.node as { raws: { before?: string } };
            const { before } = parentRaws;

            if (isNodesStatement(statement)) {
                // eslint-disable-next-line no-param-reassign
                (statement.nodes[0] as ChildNode).raws.before = before;
            } else {
                // eslint-disable-next-line no-param-reassign
                (statement.node.raws as { before?: string }).before = before;
            }
        } else if (isNodesStatement(statement)) {
            // eslint-disable-next-line no-param-reassign
            (statement.nodes[0] as ChildNode).raws.before = (statement.nodes[0] as ChildNode).raws.before ?? "\n";
        }
    });
};

export default applyRaws;
