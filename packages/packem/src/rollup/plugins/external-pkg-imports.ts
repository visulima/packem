/* eslint-disable jsdoc/match-description */
import type { Plugin } from "rollup";

import { isFromNodeModules } from "../../utils/import-specifier.js";

/**
 * Externalize package imports from the current package so Node.js resolves them at runtime using package.json#imports.
 * https://nodejs.org/api/packages.html#subpath-imports
 */
const externalPkgImports = (): Plugin => {
    const cwd = process.cwd();

    return {
        name: "packem:external-pkg-imports",
        resolveId(id, importer) {
            // Only handle package.json imports (starts with # but not #/)
            // #/ patterns are typically tsconfig path aliases, not package.json imports
            if (id[0] !== "#" || id.startsWith("#/")) {
                return undefined;
            }

            if (importer && isFromNodeModules(importer, cwd)) {
                // Let Node-resolver handle imports maps from dependencies
                return undefined;
            }

            // Import is from current package, externalize it
            return {
                external: true,
                id,
            };
        },
    };
};

export default externalPkgImports;
