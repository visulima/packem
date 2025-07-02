import type { BuildContext, Format } from "../types";

/**
 * Options interface for determining file extensions
 */
interface FileExtensionOptions {
    /** Map of format to file extension */
    outputExtensionMap?: Record<Format, string>;
    /** Whether to emit CommonJS format */
    emitCJS?: boolean;
    /** Whether to emit ESM format */
    emitESM?: boolean;
    /** Declaration file generation mode */
    declaration?: boolean | "compatible" | "node16" | undefined;
}

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
        return mapJsExtensionToDts(jsExtension);
    }

    // Fallback to traditional extensions
    return format === "esm" ? "d.mts" : "d.cts";
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
    // If outputExtensionMap is provided, always use it
    if (context.options.outputExtensionMap) {
        return context.options.outputExtensionMap[format] ?? (format === "esm" ? "mjs" : "cjs");
    }

    // If Node.js 10 compatibility is enabled, use traditional extensions
    // If both ESM and CJS are emitted, use traditional extensions for clarity
    if ((context.options.emitCJS && context.options.declaration === "compatible") || (context.options.emitESM && context.options.emitCJS)) {
        return format === "esm" ? "mjs" : "cjs";
    }

    // If only one format is emitted and no special config, use .js
    return "js";
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
    // If outputExtensionMap is provided, derive DTS extension from it
    if (context.options.outputExtensionMap) {
        return getDtsExtensionFromMap(context, format);
    }

    // If Node.js 10 compatibility is enabled, use traditional extensions
    // If both ESM and CJS are emitted, use traditional extensions for clarity
    if ((context.options.emitCJS && context.options.declaration === "compatible") || (context.options.emitESM && context.options.emitCJS)) {
        return format === "esm" ? "d.mts" : "d.cts";
    }

    // If only one format is emitted and no special config, use .d.ts
    return "d.ts";
}; 