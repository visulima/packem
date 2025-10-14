/* eslint-disable jsdoc/match-description */
import type { BuildContext, Format } from "../types";

/**
 * Extension mappings for better performance than switch statements.
 */
const JS_TO_DTS_MAP = new Map([
    ["cjs", "d.cts"],
    ["js", "d.ts"],
    ["mjs", "d.mts"],
] as const);

const FORMAT_EXTENSIONS = {
    dts: { cjs: "d.ts", esm: "d.ts" },
    traditional: { cjs: "cjs", esm: "mjs" },
    traditionalDts: { cjs: "d.cts", esm: "d.mts" },
} as const;

/**
 * Computes extension resolution strategy based on build context.
 */
const getExtensionStrategy = <T extends FileExtensionOptions>(context: BuildContext<T>) => {
    const { declaration, emitCJS, emitESM, outputExtensionMap } = context.options;

    // Check if we're in a dual format scenario
    // This can happen when:
    // 1. Both emitCJS and emitESM are enabled
    // 2. Declaration is in compatible mode (indicates dual format support needed)
    const isDualFormat = Boolean(emitCJS && emitESM);
    const isSingleFormat = !isDualFormat && ((emitCJS && !emitESM) || (emitESM && !emitCJS));

    return {
        hasOutputMap: Boolean(outputExtensionMap),
        isCompatible: declaration === "compatible" || declaration === true,
        isDualFormat,
        isSingleFormat,
        outputExtensionMap,
    };
};

/**
 * Options interface for determining file extensions.
 */
export interface FileExtensionOptions {
    /** Declaration file generation mode */
    declaration?: boolean | "compatible" | "node16" | undefined;
    /** Whether to emit CommonJS format */
    emitCJS?: boolean;
    /** Whether to emit ESM format */
    emitESM?: boolean;
    /** Map of format to file extension */
    outputExtensionMap?: Record<Format, string>;
}

/**
 * Determines the appropriate output extension for JavaScript files, based on build configuration.
 * Returns '.js' when:
 * - Only ESM or CJS is emitted (single format)
 * - No outputExtensionMap is configured
 * - Declaration is not in compatible mode
 *
 * Returns '.cjs'/'.mjs' when:
 * - Both ESM and CJS are emitted (dual format)
 * - Declaration is in compatible mode
 * - outputExtensionMap is configured
 * @param context Build context
 * @param format Target format ('esm' or 'cjs')
 * @returns File extension string
 */
export const getOutputExtension = <T extends FileExtensionOptions>(context: BuildContext<T>, format: Format): string => {
    const strategy = getExtensionStrategy(context);

    if (strategy.hasOutputMap) {
        return strategy.outputExtensionMap?.[format] ?? FORMAT_EXTENSIONS.traditional[format];
    }

    if (strategy.isSingleFormat && !strategy.isCompatible) {
        return "js";
    }

    // Use traditional extensions if dual format or compatible declaration mode
    return FORMAT_EXTENSIONS.traditional[format];
};

/**
 * Determines the appropriate declaration file extension based on build configuration.
 *
 * Returns '.d.ts' when:
 * - Only ESM or CJS is emitted (not both)
 * - No outputExtensionMap is configured
 * - Node.js 10 compatibility is disabled
 *
 * Otherwise returns traditional extensions ('.d.mts' for ESM, '.d.cts' for CJS).
 * @param context Build context
 * @param format Target format ('esm' or 'cjs')
 * @returns Declaration file extension string
 */
export const getDtsExtension = <T extends FileExtensionOptions>(context: BuildContext<T>, format: Format): string => {
    const strategy = getExtensionStrategy(context);

    if (strategy.hasOutputMap) {
        const jsExtension = strategy.outputExtensionMap?.[format];

        if (jsExtension) {
            const mappedExtension = JS_TO_DTS_MAP.get(jsExtension as "cjs" | "js" | "mjs") ?? "d.ts";

            // If we get d.ts for an unknown extension and both formats are emitted, use format-based extensions
            if (mappedExtension === "d.ts" && jsExtension !== "js" && strategy.isDualFormat) {
                return FORMAT_EXTENSIONS.traditionalDts[format];
            }

            return mappedExtension;
        }

        // Fallback to traditional extensions
        return FORMAT_EXTENSIONS.traditionalDts[format];
    }

    if (strategy.isSingleFormat && !strategy.isCompatible) {
        return "d.ts";
    }

    // Use traditional extensions if Node.js 10 compatibility is enabled or dual format
    if (strategy.isCompatible || strategy.isDualFormat) {
        return FORMAT_EXTENSIONS.traditionalDts[format];
    }

    // Default to .d.ts for single format builds
    return FORMAT_EXTENSIONS.dts[format];
};
