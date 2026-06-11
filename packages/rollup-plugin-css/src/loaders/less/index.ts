import { dirname, normalize } from "@visulima/path";
import less from "less";

import type { Loader } from "../types";
import importer from "./importer";
import type { LESSLoaderOptions } from "./types";

/**
 * Less loader for processing Less stylesheets to CSS.
 *
 * This loader:
 * - Compiles Less syntax to standard CSS
 * - Resolves `@import` statements and dependencies
 * - Handles alias resolution for imports
 * - Tracks file dependencies for watch mode
 * - Generates source maps for debugging
 * @example
 * ```less
 * // Input Less file
 * @primary-color: #007acc;
 *
 * .button {
 *   color: @primary-color;
 *   &:hover {
 *     opacity: 0.8;
 *   }
 * }
 * ```
 * @example
 * ```css
 * // Output CSS
 * .button {
 *   color: #007acc;
 * }
 * .button:hover {
 *   opacity: 0.8;
 * }
 * ```
 */
const loader: Loader<LESSLoaderOptions> = {
    name: "less",

    /**
     * Processes Less content and compiles it to CSS.
     * @param payload The payload containing Less code and source map
     * @param payload.code Less source code to compile
     * @param payload.map Input source map (if available)
     * @returns Compiled CSS with source map and dependency tracking
     */
    async process({ code, map }) {
        /** Array of Less plugins including custom importer for alias resolution */
        const plugins: Less.Plugin[] = [importer(this.alias as Record<string, string>)];

        // Add user-configured Less plugins
        if (this.options.plugins) {
            plugins.push(...this.options.plugins);
        }

        // Compile Less to CSS with source map generation. The map is always
        // produced so the downstream loader chain can trace the final output back
        // to the original Less source even when the loader-level `useSourcemap`
        // flag is not set; the final emit step decides whether to keep it.
        const result: Less.RenderOutput = await (less.render.bind(less) as (input: string, options: Less.Options) => Promise<Less.RenderOutput>)(code, {
            ...this.options,
            filename: this.id,
            plugins,
            sourceMap: { outputSourceFiles: true, sourceMapBasepath: dirname(this.id) },
        });

        // Track file dependencies for watch mode
        const deps = result.imports;

        for (const dep of deps) {
            this.deps.add(normalize(dep));
        }

        return { code: result.css, map: result.map || map };
    },

    /** RegExp pattern to match Less files */
    test: /\.less$/i,
};

export default loader;
export type { LESSLoaderOptions } from "./types";
