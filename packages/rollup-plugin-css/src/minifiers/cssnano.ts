import type { Options } from "cssnano";
import cssnano from "cssnano";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minifier } from "./types";

/**
 * CSSNano minifier implementation for optimizing CSS content.
 *
 * This minifier uses CSSNano, a modular CSS minifier built on PostCSS,
 * to optimize CSS through various transformations including:
 * - Removing whitespace and comments
 * - Merging and deduplicating rules
 * - Optimizing values and selectors
 * - Removing unused code
 * - Converting values to shorter equivalents
 *
 * The minifier preserves source maps when available and provides detailed
 * error messages for debugging minification issues.
 * @example
 * ```typescript
 * // Usage in plugin configuration
 * {
 *   minifier: cssnanoMinifier,
 *   cssnano: {
 *     preset: ['default', {
 *       discardComments: { removeAll: true },
 *       normalizeWhitespace: false
 *     }]
 *   }
 * }
 * ```
 */
const cssnanoMinifier: Minifier<Options> = {
    /**
     * Processes CSS content using CSSNano for optimization.
     *
     * This handler:
     * 1. Creates a CSSNano processor with the provided options
     * 2. Processes the CSS with source map support
     * 3. Returns optimized CSS with updated source maps
     * 4. Provides enhanced error messages for debugging
     * @param data Extracted CSS data containing content and metadata
     * @param sourceMap Source map configuration from loader context
     * @param options CSSNano-specific optimization options
     * @returns Promise resolving to optimized CSS data
     * @throws Error with detailed context if minification fails
     */
    async handler(data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options): Promise<ExtractedData> {
        // Create CSSNano processor with user options
        const minifier = cssnano(options);

        try {
            // Process CSS with source map support
            const resultMinified = await minifier.process(data.css, {
                from: data.name,
                map: sourceMap && {
                    annotation: false,
                    inline: false,
                    prev: data.map,
                    sourcesContent: sourceMap.content,
                },
                to: data.name,
            });

            return {
                ...data,
                css: resultMinified.css,
                map: resultMinified.map ? resultMinified.map.toString() : undefined,
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            throw new Error(`CSS minification failed for ${data.name}: ${error.message}`, {
                cause: error,
            });
        }
    },
    name: "cssnano",
};

export default cssnanoMinifier;
