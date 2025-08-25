import { existsSync } from "node:fs";

import { readFileSync } from "@visulima/fs";
import { dirname, join, normalize } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";
import stylus from "stylus";

import { mm } from "../../utils/sourcemap";
import type { Loader } from "../types";
import type { StylusLoaderOptions } from "./types";

/**
 * Populates the sourcesContent field in a source map by reading source files.
 *
 * Stylus compiler doesn't support sourcesContent generation, so we manually
 * read the source files and populate this field for proper source map functionality.
 * @param sourcemap Raw source map object from Stylus
 * @param basePath Base directory path for resolving relative source paths
 * @returns Array of source file contents or undefined if not needed
 */
const populateSourcemapContent = async (sourcemap: RawSourceMap, basePath: string): Promise<string[] | undefined> => {
    if (!sourcemap.sources || sourcemap.sourcesContent) {
        return undefined;
    }

    // We have to manually modify the `sourcesContent` field
    // since stylus compiler doesn't support it yet
    return (await Promise.all(
        sourcemap.sources
            .map(async (source) => {
                const file = normalize(join(basePath, source));

                if (!existsSync(file)) {
                    return undefined;
                }

                return readFileSync(file);
            })
            .filter(Boolean),
    )) as string[];
};

/**
 * Internal Stylus instance interface with additional properties.
 *
 * This extends the basic Stylus functionality to access:
 * - Dependency tracking for watch mode
 * - Generated source maps
 * - Rendering capabilities
 */
interface StylusInstance {
    /** Get array of file dependencies */
    deps: (filename?: string) => string[];

    /** Source filename being processed */
    filename: string;

    /** Render the Stylus to CSS with callback */
    render: (callback: (error: Error | undefined, css: string) => void) => void;

    /** Generated source map from compilation */
    sourcemap: RawSourceMap;
}

/**
 * Stylus loader for processing Stylus stylesheets to CSS.
 *
 * This loader:
 * - Compiles Stylus syntax to standard CSS
 * - Resolves import paths and dependencies
 * - Configures include paths for resolution
 * - Tracks file dependencies for watch mode
 * - Generates and processes source maps
 * - Handles sourcesContent population (missing from Stylus)
 * @example
 * ```stylus
 * // Input Stylus file
 * primary-color = #007acc
 *
 * .button
 *   color primary-color
 *   &:hover
 *     opacity 0.8
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
const loader: Loader<StylusLoaderOptions> = {
    name: "stylus",

    /**
     * Processes Stylus content and compiles it to CSS.
     * @param payload The payload containing Stylus code and source map
     * @param payload.code Stylus source code to compile
     * @param payload.map Input source map (if available)
     * @returns Compiled CSS with source map and dependency tracking
     */
    async process({ code, map }) {
        const options = { ...this.options };
        const basePath = normalize(dirname(this.id));

        // Configure include paths for import resolution
        const paths = [basePath, join(basePath, "node_modules"), join(this.cwd as string, "node_modules")];

        if (options.paths) {
            paths.push(...options.paths);
        }

        // Create Stylus instance with configuration
        const style = stylus(code, options)
            .set("filename", this.id)
            .set("paths", paths)
            .set("sourcemap", { basePath, comment: false }) as unknown as StylusInstance;

        /**
         * Promisified Stylus render function.
         * @returns Promise resolving to compiled CSS string
         */
        const render = async (): Promise<string> =>
            await new Promise((resolve, reject) => {
                style.render((error, css) => (error ? reject(error) : resolve(css)));
            });

        // Compile Stylus to CSS
        // eslint-disable-next-line no-param-reassign
        code = await render();

        // Track file dependencies for watch mode
        const deps = style.deps();

        for (const dep of deps) {
            this.deps.add(normalize(dep));
        }

        // Populate source map content since Stylus doesn't support it natively
        if (style.sourcemap) {
            style.sourcemap.sourcesContent = await populateSourcemapContent(style.sourcemap, basePath);
        }

        return { code, map: mm(style.sourcemap as unknown as RawSourceMap).toString() ?? map };
    },
    // RegExp pattern to match Stylus files
    test: /\.(styl|stylus)$/i,
};

export default loader;
export type { StylusLoaderOptions } from "./types";
