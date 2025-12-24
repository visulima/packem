import { createRequire } from "node:module";

import { readFile } from "@visulima/fs";
import { findPackageJson } from "@visulima/package/package-json";
import { init, parse } from "cjs-module-lexer";
import type { ResolvedId } from "rollup";

const initted = false;

/**
 * Determines if a module is a pure CommonJS module by checking various indicators.
 * @param id The module ID to check
 * @param importer The importer context (can be a file path or Rollup plugin context)
 * @param rollupResolve Optional Rollup resolve function for better module resolution
 */

export const isPureCJS = async (
    id: string,
    importer: string,
    rollupResolve?: (id: string, importer?: string) => Promise<ResolvedId | null>,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<boolean> => {
    if (!initted) {
        await init();
    }

    // ignore Node.js built-in modules, as their performance is comparable
    if (id.startsWith("node:"))
        return false;

    // Check if it's a .cjs file
    if (id.endsWith(".cjs")) {
        return true;
    }

    // For .js files, try to determine the module type
    if (id.endsWith(".js") || (!id.includes("/") && !id.startsWith("."))) {
        let resolvedPath: string | undefined;

        // Try Rollup's resolver first if available
        if (rollupResolve) {
            try {
                const resolved = await rollupResolve(id, importer);

                resolvedPath = resolved.id;
            } catch {
                // Fall back to require.resolve if Rollup resolution fails
            }
        }

        // Fall back to require.resolve if we have a valid importer path
        if (!resolvedPath && importer && !importer.includes("!~{")) {
            try {
                const requireFunction = createRequire(importer);

                resolvedPath = requireFunction.resolve(id);
            } catch {
                // Continue without resolved path
            }
        }

        // If we have a resolved path, check it
        if (resolvedPath) {
            try {
                const { packageJson } = await findPackageJson(resolvedPath);

                if (packageJson.type === "module") {
                    return false;
                }

                if (packageJson.type === "commonjs") {
                    return true;
                }
            } catch {
                // just continue
            }

            // detect by parsing
            try {
                const contents = await readFile(resolvedPath, { encoding: "utf8" });

                try {
                    parse(contents, resolvedPath);

                    return true;
                } catch {
                    // just continue
                }
            } catch {
                // just continue
            }
        }
    }

    return false;
};

export default isPureCJS;
