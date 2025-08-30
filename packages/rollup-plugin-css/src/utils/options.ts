import type { RollupLogger } from "@visulima/packem-share/utils";
import type { Result } from "postcss-load-config";

import type { LoaderContext } from "../loaders/types";
import type { InternalStyleOptions, PostCSSOptions, StyleOptions } from "../types";
import arrayFmt from "./array-fmt";
import loadModule from "./load-module";

/**
 * Internal mode configuration for style processing.
 *
 * Represents the resolved mode options that determine how CSS is handled:
 * - emit: Output raw CSS for further processing
 * - extract: Extract CSS to separate files
 * - inject: Inject CSS into JavaScript at runtime
 */
interface Mode {
    /** Whether to emit raw CSS for further processing */
    emit: InternalStyleOptions["emit"];

    /** Whether to extract CSS to separate files (boolean or filename) */
    extract: InternalStyleOptions["extract"];

    /** Whether to inject CSS at runtime (boolean or injection options) */
    inject: InternalStyleOptions["inject"];

    /** Whether to inline CSS as strings in JavaScript */
    inline: InternalStyleOptions["inline"];
}

/** Available CSS processing modes */
const modes = ["inject", "extract", "emit", "inline"];

/** Formatted string of available modes for error messages */
const modesFmt = arrayFmt(modes);

/** PostCSS option types for error messages */
type PCSSOption = "parser" | "plugin" | "stringifier" | "syntax";

/**
 * Infers and validates the CSS processing mode from user options.
 *
 * Converts the user-provided mode configuration into internal mode settings.
 * Supports both simple string modes and tuple modes with additional options.
 * @param mode User-provided mode configuration
 * @returns Resolved mode configuration object
 * @throws Error if an invalid mode is provided
 * @example
 * ```typescript
 * // Simple mode
 * inferModeOption('extract') // { emit: false, extract: true, inject: false }
 *
 * // Mode with options
 * inferModeOption(['inject', { singleTag: true }])
 * // { emit: false, extract: false, inject: { singleTag: true } }
 *
 * // Default mode (inject)
 * inferModeOption(undefined) // { emit: false, extract: false, inject: true }
 * ```
 */
export const inferModeOption = (mode: StyleOptions["mode"]): Mode => {
    const m = Array.isArray(mode) ? mode : ([mode] as const);

    if (m[0] && !modes.includes(m[0])) {
        throw new Error(`Incorrect mode provided, allowed modes are ${modesFmt}`);
    }

    // Default mode is "inject" when not provided
    const modeName = (m[0] ?? "inject") as (typeof modes)[number];

    return {
        emit: modeName === "emit",
        extract: (modeName === "extract" && (m[1] ?? true)) as InternalStyleOptions["extract"],
        inject: (modeName === "inject" && (m[1] ?? true)) as InternalStyleOptions["inject"],
        inline: modeName === "inline",
    };
};

/**
 * Infers option values from boolean or object configurations.
 *
 * This utility handles the common pattern where options can be:
 * - `true`: Enable with default settings (returns empty object)
 * - `false`: Disable the option (returns false)
 * - `object`: Use the provided configuration
 * - `undefined`: Use the provided default value
 * @param option The option value to process
 * @param defaultValue Default value when option is undefined
 * @returns Processed option value
 * @example
 * ```typescript
 * inferOption(true, {}) // {}
 * inferOption(false, {}) // false
 * inferOption({ custom: 'value' }, {}) // { custom: 'value' }
 * inferOption(undefined, { default: true }) // { default: true }
 * ```
 */
export const inferOption = <T, TDefine extends T | boolean | undefined>(option: T | boolean | undefined, defaultValue: TDefine): OptionType<T, TDefine> => {
    if (typeof option === "boolean") {
        return option && ({} as TDefine);
    }

    if (typeof option === "object") {
        return option;
    }

    return defaultValue;
};

/**
 * Infers source map configuration from user options.
 *
 * Processes source map options which can be specified as:
 * - `boolean`: Enable/disable with default settings
 * - `"inline"`: Enable with inline source maps
 * - `[boolean | "inline", SourceMapOptions]`: Enable with custom options
 * @param sourceMap User-provided source map configuration
 * @returns Processed source map configuration for loaders
 * @example
 * ```typescript
 * inferSourceMapOption(true) // { content: true, inline: false }
 * inferSourceMapOption('inline') // { content: true, inline: true }
 * inferSourceMapOption([true, { transform: fn }]) // { content: true, inline: false, transform: fn }
 * inferSourceMapOption(false) // false
 * ```
 */
export const inferSourceMapOption = (sourceMap: StyleOptions["sourceMap"]): LoaderContext["sourceMap"] => {
    const sm = Array.isArray(sourceMap) ? sourceMap : ([sourceMap] as const);

    if (!sm[0]) {
        return false;
    }

    return { content: true, ...sm[1], inline: sm[0] === "inline" };
};

/**
 * Infers handler options that support alias configuration.
 *
 * Processes options for handlers (like import/url resolvers) that can use aliases.
 * If aliases are provided and the option doesn't already have aliases, they are merged.
 * @param option Handler option configuration
 * @param alias Path aliases to merge if not already present
 * @returns Processed handler option with aliases
 * @example
 * ```typescript
 * const aliases = { '@': '/src' };
 *
 * inferHandlerOption(true, aliases) // { alias: { '@': '/src' } }
 * inferHandlerOption({ custom: true }, aliases) // { custom: true, alias: { '@': '/src' } }
 * inferHandlerOption({ alias: { '~': '/lib' } }, aliases) // { alias: { '~': '/lib' } }
 * ```
 */
export const inferHandlerOption = <T extends { alias?: Record<string, string> }>(option: T | boolean | undefined, alias: T["alias"]): T | false => {
    const opt = inferOption(option, {} as T);

    if (alias && typeof opt === "object" && !opt.alias) {
        opt.alias = alias;
    }

    return opt;
};

/**
 * Ensures a PostCSS option is properly loaded and resolved.
 *
 * PostCSS options can be specified as strings (module names) or objects.
 * This function loads string-based options as modules and validates they exist.
 * @param option PostCSS option (string module name or object)
 * @param type Type of PostCSS option for error messages
 * @param cwd Current working directory for module resolution
 * @param logger Optional logger for warnings
 * @returns Promise resolving to the loaded PostCSS option
 * @throws Error if string module cannot be loaded
 * @example
 * ```typescript
 * // Load parser module
 * await ensurePCSSOption('sugarss', 'parser', process.cwd()) // Loaded sugarss module
 *
 * // Pass through object
 * await ensurePCSSOption(parserObject, 'parser', process.cwd()) // parserObject
 * ```
 */
export const ensurePCSSOption = async <T>(option: T | string, type: PCSSOption, cwd: string, logger: RollupLogger): Promise<T> => {
    if (typeof option !== "string") {
        return option;
    }

    const module = await loadModule(option, cwd, logger);

    if (!module) {
        throw new Error(`Unable to load PostCSS ${type} \`${option}\``);
    }

    return module as T;
};

/**
 * Ensures PostCSS plugins are properly loaded and configured.
 *
 * PostCSS plugins can be specified in various formats:
 * - String module names
 * - Plugin objects
 * - Arrays of [plugin, options]
 * - Mixed arrays of the above
 *
 * This function normalizes all formats and loads string-based plugins as modules.
 * @param plugins PostCSS plugins configuration
 * @param cwd Current working directory for module resolution
 * @param logger Optional logger for warnings
 * @returns Promise resolving to array of loaded PostCSS plugins
 * @example
 * ```typescript
 * // Load plugins from various formats
 * await ensurePCSSPlugins([
 *   'autoprefixer',                    // String module name
 *   ['cssnano', { preset: 'default' }], // Plugin with options
 *   pluginObject                       // Direct plugin object
 * ], process.cwd())
 * ```
 */
export const ensurePCSSPlugins = async (plugins: PostCSSOptions["plugins"], cwd: string, logger: RollupLogger): Promise<Result["plugins"]> => {
    if (plugins === undefined) {
        return [];
    }

    if (plugins.length === 0) {
        return [];
    }

    const ps: Result["plugins"] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const plugin of (plugins as any[]).filter(Boolean)) {
        if (!Array.isArray(plugin)) {
            ps.push(await ensurePCSSOption(plugin, "plugin", cwd, logger));

            continue;
        }

        const [plug, options] = plugin;

        if (options) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ps.push((await ensurePCSSOption<any>(plug, "plugin", cwd, logger))(options));
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ps.push(await ensurePCSSOption<any>(plug, "plugin", cwd, logger));
        }
    }

    return ps;
};

/**
 * Type alias for option function return types
 */
export type OptionType<T, TDefine extends T | boolean | undefined> = T | TDefine | false;
