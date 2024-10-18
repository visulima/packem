import type { Document, Root } from "postcss";

import type { Stylesheet } from "./types";
import { isImportStatement, isNodesStatement } from "./utils/statement";

const applyStyles = (stylesheet: Stylesheet, styles: Root | Document): void => {
    // eslint-disable-next-line no-param-reassign
    styles.nodes = [];

    if (stylesheet.charset) {
        // eslint-disable-next-line no-param-reassign
        stylesheet.charset.parent = undefined;

        styles.append(stylesheet.charset);
    }

    // Strip additional statements.
    stylesheet.statements.forEach((stmt) => {
        if (isImportStatement(stmt)) {
            // eslint-disable-next-line no-param-reassign
            stmt.node.parent = undefined;

            styles.append(stmt.node);
        } else if (isNodesStatement(stmt)) {
            stmt.nodes.forEach((node) => {
                // eslint-disable-next-line no-param-reassign
                node.parent = undefined;

                styles.append(node);
            });
        }
    });
};

export default applyStyles;
