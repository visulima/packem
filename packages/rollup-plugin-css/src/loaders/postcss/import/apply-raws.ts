import type { ChildNode } from "postcss";

import type { ImportStatement, NodesStatement, PreImportStatement, Stylesheet } from "./types";
import { isNodesStatement } from "./utils/statement";

const applyRaws = (stylesheet: Stylesheet): void => {
    stylesheet.statements.forEach((stmt, index) => {
        if (index === 0) {
            return;
        }

        if ((stmt as ImportStatement | NodesStatement | PreImportStatement).parent !== undefined) {
            const parent = (stmt as ImportStatement | PreImportStatement).parent as ImportStatement | PreImportStatement;
            const { raws: parentRaws } = parent.node as { raws: { before?: string } };
            const { before } = parentRaws;

            if (isNodesStatement(stmt)) {
                // eslint-disable-next-line no-param-reassign
                (stmt.nodes[0] as ChildNode).raws.before = before;
            } else {
                // eslint-disable-next-line no-param-reassign
                (stmt.node.raws as { before?: string }).before = before;
            }
        } else if (isNodesStatement(stmt)) {
            // eslint-disable-next-line no-param-reassign
            (stmt.nodes[0] as ChildNode).raws.before = (stmt.nodes[0] as ChildNode).raws.before ?? "\n";
        }
    });
};

export default applyRaws;
