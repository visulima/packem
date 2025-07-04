import type { BuildContext, Format } from "../types";

/**
 * Extension mappings for better performance than switch statements
 */
const JS_TO_DTS_MAP = new Map([
    ["cjs", "d.cts"],
    ["js", "d.ts"],
    ["mjs", "d.mts"],
] as const);

const FORMAT_EXTENSIONS = {
    js: { esm: "js", cjs: "js" },
    traditional: { esm: "mjs", cjs: "cjs" },
    dts: { esm: "d.ts", cjs: "d.ts" },
    traditionalDts: { esm: "d.mts", cjs: "d.cts" },
} as const;

/**
 * Maps JavaScript extension to corresponding TypeScript declaration extension.
 */
const mapJsExtensionToDts = (jsExtension: string): string => {
    switch (jsExtension) {
        case "cjs": {
            return "d.cts";
        }
        case "js": {
            return "d.ts";
        }
        case "mjs": {
            return "d.mts";
        }
        default: {
            return "d.ts";
        }
    }
};

/**
 * Determines declaration extension when outputExtensionMap is provided.
 */
const getDtsExtensionFromMap = <T extends FileExtensionOptions>(context: BuildContext<T>, format: Format): string => {
    const jsExtension = context.options.outputExtensionMap?.[format];

    if (jsExtension) {
        const mappedExtension = mapJsExtensionToDts(jsExtension);

        // If we get d.ts for an unknown extension and both formats are emitted, use format-based extensions
        if (mappedExtension === "d.ts" && jsExtension !== "js" && context.options.emitCJS && context.options.emitESM) {
            return format === "esm" ? "d.mts" : "d.cts";
        }

        return mappedExtension;
    }

    // Fallback to traditional extensions
    return format === "esm" ? "d.mts" : "d.cts";
};

/**
 * Options interface for determining file extensions
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
 * Computes extension resolution strategy based on build context
 */
const getExtensionStrategy = <T extends FileExtensionOptions>(context: BuildContext<T>) => {
    const { emitCJS, emitESM, declaration, outputExtensionMap } = context.options;

    return {
        hasOutputMap: Boolean(outputExtensionMap),
        isDualFormat: Boolean(emitCJS && emitESM),
        isCompatible: emitCJS && (declaration === "compatible" || declaration === true),
        outputExtensionMap,
    };
};

/**
 * Determines the appropriate output extension for JavaScript files based on build configuration.
 *
 * Returns '.js' when:
 * - Only ESM or CJS is emitted (not both)
 * - No outputExtensionMap is configured
 * - Node.js 10 compatibility is disabled
 *
 * Otherwise returns traditional extensions ('.mjs' for ESM, '.cjs' for CJS).
 * @param context Build context
 * @param format Target format ('esm' or 'cjs')
 * @returns File extension string
 */
export const getOutputExtension = <T extends FileExtensionOptions>(context: BuildContext<T>, format: Format): string => {
    const strategy = getExtensionStrategy(context);

    if (strategy.hasOutputMap) {
        return strategy.outputExtensionMap?.[format] ?? FORMAT_EXTENSIONS.traditional[format];
    }

    // Use traditional extensions if Node.js 10 compatibility is enabled or dual format
    if (strategy.isCompatible || strategy.isDualFormat) {
        return FORMAT_EXTENSIONS.traditional[format];
    }

    // Default to .js for single format builds
    return FORMAT_EXTENSIONS.js[format];
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
        const jsExtension = strategy.outputExtensionMap![format];

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

    // Use traditional extensions if Node.js 10 compatibility is enabled or dual format
    if (strategy.isCompatible || strategy.isDualFormat) {
        return FORMAT_EXTENSIONS.traditionalDts[format];
    }

    // Default to .d.ts for single format builds
    return FORMAT_EXTENSIONS.dts[format];
};
