import type { ChildNode } from "postcss";

import type { ImportStatement, NodesStatement, PreImportStatement, Stylesheet } from "./types";
import { isNodesStatement } from "./utils/statement";

const applyRaws = (stylesheet: Stylesheet): void => {
    stylesheet.statements.forEach((stmt, index) => {
        if (index === 0) {
            return;
        }

        if ((stmt as ImportStatement | PreImportStatement | NodesStatement).parent !== undefined) {
            const { before } = ((stmt as ImportStatement | PreImportStatement).parent as ImportStatement | PreImportStatement).node.raws;

            if (isNodesStatement(stmt)) {
                // eslint-disable-next-line no-param-reassign
                (stmt.nodes[0] as ChildNode).raws.before = before;
            } else {
                // eslint-disable-next-line no-param-reassign
                stmt.node.raws.before = before;
            }
        } else if (isNodesStatement(stmt)) {
            // eslint-disable-next-line no-param-reassign
            (stmt.nodes[0] as ChildNode).raws.before = (stmt.nodes[0] as ChildNode).raws.before ?? "\n";
        }
    });
};

export default applyRaws;
