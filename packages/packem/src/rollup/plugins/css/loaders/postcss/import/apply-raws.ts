import type { Root } from "postcss";

import type { Statement } from "./types";

const applyRaws = (bundle: Statement[]): void => {
    bundle.forEach((stmt, index) => {
        if (index === 0) {
            return;
        }

        if (stmt.parent) {
            const { before } = stmt.parent.node.raws;

            if (stmt.type === "nodes" && stmt.nodes) {
                // eslint-disable-next-line no-param-reassign
                (stmt.nodes[0] as Root).raws.before = before;
            } else {
                // eslint-disable-next-line no-param-reassign
                (stmt.node as Root).raws.before = before;
            }
        } else if (stmt.type === "nodes") {
            // eslint-disable-next-line no-param-reassign
            ((stmt.nodes as Root[])[0] as Root).raws.before = ((stmt.nodes as Root[])[0] as Root).raws.before || "\n";
        }
    });
};

export default applyRaws;
