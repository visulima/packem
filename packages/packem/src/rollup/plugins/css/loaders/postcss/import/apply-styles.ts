/**
 * Modified copy of https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-bundler/src/postcss-import/lib/apply-styles.ts
 *
 * MIT No Attribution (MIT-0)
 * Copyright © CSSTools Contributors
 */
import type { Document, Root } from "postcss";

import type { Stylesheet } from "./types";
import { isImportStatement, isNodesStatement } from "./utils/statement";

const applyStyles = (stylesheet: Stylesheet, styles: Document | Root): void => {
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
