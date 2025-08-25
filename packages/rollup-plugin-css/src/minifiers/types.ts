import type { RollupLogger } from "@visulima/packem-share/utils";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";

/**
 * Context object provided to minifier handlers during CSS minification.
 *
 * Contains build-time information and utilities needed for proper minification:
 * - Browser compatibility targets for optimization decisions
 * - Logging system for reporting minification issues
 */
type MinifierContext = {
    /** Browser targets for compatibility-aware minification */
    readonly browserTargets: string[];

    /**
     * Rollup-compatible logger for reporting minification issues.
     * Provides consistent logging across all plugin operations.
     */
    readonly logger: RollupLogger;
};

/**
 * Interface for CSS minification plugins.
 *
 * Minifiers are responsible for optimizing CSS content while preserving
 * functionality and maintaining source maps when available. They receive
 * extracted CSS data and return optimized versions.
 * @template Options Configuration options type for the minifier
 * @example
 * ```typescript
 * const myMinifier: Minifier<MyOptions> = {
 *   name: 'my-minifier',
 *   async handler(data, sourceMap, options) {
 *     // Minify CSS content
 *     const minified = await minifyCss(data.css, options);
 *
 *     // Report any warnings
 *     if (minified.warnings.length > 0) {
 *       this.logger.warn({ message: `Minification warnings: ${minified.warnings.join(', ')}` });
 *     }
 *
 *     return {
 *       ...data,
 *       css: minified.css,
 *       map: minified.map
 *     };
 *   }
 * };
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Minifier<Options = Record<string, any>> {
    /**
     * Minification handler function.
     *
     * Processes CSS content and returns optimized version with updated source maps.
     * The handler is called with minifier context containing browser targets and warning utilities.
     * @param data Extracted CSS data to minify
     * @param sourceMap Source map configuration from loader context
     * @param options Minifier-specific configuration options
     * @returns Promise resolving to minified CSS data
     */
    handler: (this: MinifierContext, data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options) => Promise<ExtractedData>;

    /** Unique name identifier for the minifier */
    name: string;
}
