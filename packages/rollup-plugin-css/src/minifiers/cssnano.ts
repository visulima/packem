import type { Options } from "cssnano";
import cssnano from "cssnano";
import type { Processor } from "postcss";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minifier } from "./types";

// cssnano 8's generated `.d.ts` types its own return as `any`, even though its JSDoc promises a
// postcss `Processor` — v9 declares it correctly. Pinning the real signature here keeps the `any`
// from spreading through `process()` and everything it returns.
const createMinifier = cssnano as unknown as (options?: Options) => Processor;

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
     * 1. Creates a CSSNano processor with the provided options.
     * 2. Processes the CSS with source map support.
     * 3. Returns optimized CSS with updated source maps.
     * 4. Provides enhanced error messages for debugging.
     * @param data Extracted CSS data containing content and metadata.
     * @param sourceMap Source map configuration from loader context.
     * @param options CSSNano-specific optimization options.
     * @returns Promise resolving to optimized CSS data.
     * @throws Error with detailed context if minification fails.
     */
    async handler(data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options): Promise<ExtractedData> {
        const minifier = createMinifier(options);

        try {
            const cssNanoMap = sourceMap
                ? {
                      annotation: false,
                      inline: false,
                      prev: data.map,
                      sourcesContent: sourceMap.content,
                  }
                : undefined;

            // Process CSS with source map support
            const resultMinified = await minifier.process(data.css, {
                from: data.name,
                map: cssNanoMap,
                to: data.name,
            });

            return {
                ...data,
                css: resultMinified.css,
                map: sourceMap ? resultMinified.map.toString() : undefined,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);

            throw new Error(`CSS minification failed for ${data.name}: ${message}`, {
                cause: error,
            });
        }
    },
    name: "cssnano",
};

export default cssnanoMinifier;
