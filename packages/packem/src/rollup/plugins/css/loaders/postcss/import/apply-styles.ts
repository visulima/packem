import type { Root } from "postcss";

import type { Statement } from "./types";

const applyStyles = (bundle: Statement[], styles: Root): void => {
    // eslint-disable-next-line no-param-reassign
    styles.nodes = [];

    // Strip additional statements.
    bundle.forEach((stmt) => {
        if (["charset", "import"].includes(stmt.type)) {
            // eslint-disable-next-line no-param-reassign
            (stmt.node as Root).parent = undefined;

            styles.append(stmt.node);
        } else if (stmt.type === "nodes") {
            (stmt.nodes as Root[]).forEach((node) => {
                // eslint-disable-next-line no-param-reassign
                node.parent = undefined;

                styles.append(node);
            });
        }
    });
};

export default applyStyles;
