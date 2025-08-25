import { browserslistToTargets, transform } from "lightningcss";

import type { LightningCSSOptions } from "../types";
import type { Loader } from "./types";
import ensureAutoModules from "./utils/ensure-auto-modules";

/**
 * LightningCSS loader for processing CSS files with LightningCSS transformer.
 *
 * This loader uses LightningCSS to transform CSS files, providing:
 * - CSS minification and optimization
 * - CSS modules support
 * - Browser compatibility transformations
 * - Source map generation
 * @example
 * ```typescript
 * // CSS modules are automatically detected based on file naming or configuration
 * // Input: styles.module.css
 * // Output: Transformed CSS with module exports
 * ```
 */
const lightningCSSLoader: Loader<LightningCSSOptions> = {
    name: "lightningCSS",

    /**
     * Process CSS content using LightningCSS transformer.
     * @param payload The payload containing CSS code and source map
     * @param payload.code Raw CSS content to transform
     * @param payload.map Input source map (if available)
     * @returns Transformed CSS with updated code and source map
     */
    async process({ code, map }) {
        let supportModules = false;

        // Determine if CSS modules should be enabled
        if (typeof this.options.modules === "boolean") {
            supportModules = this.options.modules;
        } else if (typeof this.options.modules === "object") {
            supportModules = ensureAutoModules(this.options.modules.include, this.id);
        }

        // Check for automatic CSS modules detection
        if (this.autoModules && this.options.modules === undefined) {
            supportModules = ensureAutoModules(this.autoModules, this.id);
        }

        // Transform CSS using LightningCSS
        const result = transform({
            ...this.options,
            code: Buffer.from(code),
            cssModules: this.options.modules ?? supportModules,
            filename: this.id,
            inputSourceMap: map,
            minify: false,
            sourceMap: !this.sourceMap,
            targets: browserslistToTargets(this.browserTargets),
        });

        // Report any transformation warnings
        if (result.warnings.length > 0) {
            this.logger.warn({ message: `warnings when transforming css:\n${result.warnings.map((w) => w.message).join("\n")}` });
        }

        // Note: The following code is commented out due to non-deterministic exports order
        // See: https://github.com/parcel-bundler/lightningcss/issues/291
        // /**
        //  * Addresses non-deterministic exports order:
        //  * https://github.com/parcel-bundler/lightningcss/issues/291
        //  */
        // const exports = Object.fromEntries(
        //     Object.entries(
        //         // `exports` is defined if cssModules is true
        //         // eslint-disable-next-line @typescript-eslint/no-non-undefined-assertion
        //         result.exports!,
        //     ).sort(
        //         // Cheap alphabetical sort (localCompare is expensive)
        //         ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
        //     ),
        // );

        return {
            code: result.code.toString(),
            map: result.map ? (JSON.parse(Buffer.from(result.map).toString()) as string) : undefined,
            moduleSideEffects: supportModules || (typeof this.inject === "object" && this.inject.treeshakeable) ? false : "no-treeshake",
        };
    },

    /** RegExp pattern to match CSS files */
    test: /\.css$/i,
};

export default lightningCSSLoader;
