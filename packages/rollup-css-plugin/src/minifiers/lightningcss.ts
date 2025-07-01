import { browserslistToTargets, transform } from "lightningcss";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData, InternalStyleOptions } from "../types";
import type { Minifier } from "./types";

/**
 * LightningCSS minifier implementation for high-performance CSS optimization.
 *
 * This minifier uses LightningCSS, a fast CSS parser and transformer written in Rust,
 * to optimize CSS with excellent performance characteristics. It provides:
 * - Ultra-fast parsing and minification
 * - Browser-specific optimizations based on targets
 * - Advanced CSS transformations and vendor prefixing
 * - Built-in support for modern CSS features
 * - Comprehensive warning system for potential issues
 *
 * The minifier automatically converts browserslist targets to LightningCSS format
 * and reports any warnings encountered during the minification process.
 * @example
 * ```typescript
 * // Usage in plugin configuration
 * {
 *   minifier: lightningcssMinifier,
 *   lightningcss: {
 *     targets: { chrome: 90 },
 *     unusedSymbols: ['old-class'],
 *     errorRecovery: true
 *   }
 * }
 * ```
 */
const lightningcssMinifier: Minifier<NonNullable<InternalStyleOptions["lightningcss"]>> = {
    /**
     * Processes CSS content using LightningCSS for optimization.
     *
     * This handler:
     * 1. Configures LightningCSS with browser targets and options
     * 2. Transforms CSS with minification enabled
     * 3. Reports any transformation warnings
     * 4. Returns optimized CSS with source maps
     * @param data Extracted CSS data containing content and metadata
     * @param sourceMap Source map configuration from loader context
     * @param options LightningCSS-specific transformation options
     * @returns Promise resolving to optimized CSS data
     */
    async handler(
        data: ExtractedData,
        sourceMap: LoaderContext["sourceMap"],
        options: NonNullable<InternalStyleOptions["lightningcss"]>,
    ): Promise<ExtractedData> {
        // Transform CSS using LightningCSS with minification enabled
        const result = transform({
            ...options,
            code: Buffer.from(data.css),
            cssModules: undefined, // Disable CSS modules for minification
            filename: data.name,
            inputSourceMap: data.map,
            minify: true, // Enable minification
            sourceMap: Boolean(sourceMap),
            targets: browserslistToTargets(this.browserTargets),
        });

        // Report any transformation warnings
        if (result.warnings.length > 0) {
            this.logger.warn({ message: `warnings when minifying css:\n${result.warnings.map((w) => w.message).join("\n")}` });
        }

        return {
            ...data,
            css: result.code.toString(),
            map: "map" in result ? result.map?.toString() : undefined,
        };
    },
    name: "lightningcss",
};

export default lightningcssMinifier;
