import type { BabelPluginConfig } from "@visulima/packem-rollup/babel";

import type { BuildConfig } from "../../types";

/**
 * Build solid preset options from user options.
 */
const buildSolidPresetOptions = (solidOptions: SolidPresetOptions["solidOptions"]): Record<string, unknown> => {
    const presetOptions: Record<string, unknown> = {
        contextToCustomElements: solidOptions?.contextToCustomElements ?? true,
        delegateEvents: solidOptions?.delegateEvents ?? true,
        generate: solidOptions?.generate ?? "dom",
        hydratable: solidOptions?.hydratable ?? false,
        moduleName: solidOptions?.moduleName ?? "solid-js/web",
        wrapConditionals: solidOptions?.wrapConditionals ?? true,
    };

    // Only include builtIns if explicitly provided (don't set to undefined)
    if (solidOptions?.builtIns !== undefined) {
        presetOptions.builtIns = solidOptions.builtIns;
    }

    return presetOptions;
};

/**
 * Merge user-provided babel options with base config.
 */
const mergeUserBabelOptions = (
    baseConfig: BabelPluginConfig,
    userBabelOptions: SolidPresetOptions["babel"],
    basePlugins: BabelPluginConfig["plugins"],
    basePresets: BabelPluginConfig["presets"],
): BabelPluginConfig => {
    if (!userBabelOptions || typeof userBabelOptions === "function") {
        return baseConfig;
    }

    // Merge user plugins
    let mergedPlugins = basePlugins;

    if (userBabelOptions.plugins) {
        const userPluginsArray = Array.isArray(userBabelOptions.plugins) ? userBabelOptions.plugins : [];

        mergedPlugins = [...basePlugins || [], ...userPluginsArray];
    }

    // Merge user presets
    let mergedPresets = basePresets;

    if (userBabelOptions.presets) {
        const userPresetsArray = Array.isArray(userBabelOptions.presets) ? userBabelOptions.presets : [];

        mergedPresets = [...basePresets || [], ...userPresetsArray];
    }

    return {
        ...baseConfig,
        ...userBabelOptions,
        plugins: mergedPlugins && mergedPlugins.length > 0 ? mergedPlugins : undefined,
        presets: mergedPresets && mergedPresets.length > 0 ? mergedPresets : undefined,
    };
};

export interface SolidPresetOptions {
    /**
     * Pass any additional babel transform options. They will be merged with
     * the transformations required by Solid.
     */
    babel?: BabelPluginConfig | ((source: string, id: string) => BabelPluginConfig | Promise<BabelPluginConfig>);

    /**
     * Custom Babel plugins to add
     */
    plugins?: BabelPluginConfig["plugins"];

    /**
     * Custom Babel presets to add
     */
    presets?: BabelPluginConfig["presets"];

    /**
     * SolidJS-specific options for babel-preset-solid
     */
    solidOptions?: {
        /**
         * Array of Component exports from module, that aren't included by default with the library.
         * This plugin will automatically import them if it comes across them in the JSX.
         * @default ["For","Show","Switch","Match","Suspense","SuspenseList","Portal","Index","Dynamic","ErrorBoundary"]
         */
        builtIns?: string[];

        /**
         * Boolean indicates whether to set current render context on Custom Elements and slots.
         * Useful for seemless Context API with Web Components.
         * @default true
         */
        contextToCustomElements?: boolean;

        /**
         * Boolean to indicate whether to enable automatic event delegation on camelCase.
         * @default true
         */
        delegateEvents?: boolean;

        /**
         * The output mode of the compiler.
         * Can be:
         * - "dom" is standard output
         * - "ssr" is for server side rendering of strings.
         * - "universal" is for using custom renderers from solid-js/universal
         * @default "dom"
         */
        generate?: "ssr" | "dom" | "universal";

        /**
         * Indicate whether the output should contain hydratable markers.
         * @default false
         */
        hydratable?: boolean;

        /**
         * The name of the runtime module to import the methods from.
         * @default "solid-js/web"
         */
        moduleName?: string;

        /**
         * Boolean indicates whether smart conditional detection should be used.
         * This optimizes simple boolean expressions and ternaries in JSX.
         * @default true
         */
        wrapConditionals?: boolean;
    };
}

/**
 * SolidJS preset for Packem. Configures Babel with babel-preset-solid.
 * @description This preset configures Babel to run before your main transformer (esbuild/SWC/etc.).
 * Babel handles JSX transformation for SolidJS using babel-preset-solid. TypeScript is handled
 * automatically via parser plugins based on file extensions (no preset needed).
 * @example
 * ```typescript
 * // Basic usage
 * export default defineConfig({
 *   preset: "solid"
 * });
 *
 * // With custom Solid options
 * import { createSolidPreset } from "@visulima/packem/config/preset/solid";
 * export default defineConfig({
 *   preset: createSolidPreset({
 *     solidOptions: {
 *       generate: "ssr",
 *       hydratable: true
 *     }
 *   })
 * });
 *
 * // With custom Babel options
 * export default defineConfig({
 *   preset: createSolidPreset({
 *     solidOptions: {
 *       moduleName: "solid-js/web"
 *     },
 *     babel: {
 *       // Additional babel options
 *     }
 *   })
 * });
 * ```
 */

export const createSolidPreset = (options: SolidPresetOptions = {}): BuildConfig => {
    const { babel: userBabelOptions, plugins = [], presets = [], solidOptions = {} } = options;

    const babelPlugins: BabelPluginConfig["plugins"] = [];
    const babelPresets: BabelPluginConfig["presets"] = [];

    // Only use babel-preset-solid (matching vite-plugin-solid approach)
    // TypeScript is handled automatically via parser plugins in the babel plugin
    // No need for @babel/preset-env or @babel/preset-typescript
    const solidPresetOptions = buildSolidPresetOptions(solidOptions);

    const solidPreset: [string, Record<string, unknown>] = ["babel-preset-solid", solidPresetOptions];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    babelPresets.push(solidPreset as any);

    // Merge user-provided plugins and presets
    const finalPlugins = [...babelPlugins, ...Array.isArray(plugins) ? plugins : []];
    const finalPresets = [...babelPresets, ...Array.isArray(presets) ? presets : []];

    // Build base babel config (matching vite-plugin-solid structure)
    const babelConfig: BabelPluginConfig = {
        ast: false,
        babelrc: false,
        configFile: false,
        plugins: finalPlugins.length > 0 ? finalPlugins : undefined,
        presets: finalPresets.length > 0 ? finalPresets : undefined,
        sourceMaps: true,
    };

    // Merge user babel options if provided (static options only for now)
    // Function-based options would require babel plugin changes
    const mergedBabelConfig = mergeUserBabelOptions(babelConfig, userBabelOptions, finalPlugins, finalPresets);

    const rollupConfig: BuildConfig["rollup"] = {
        babel: mergedBabelConfig,
        resolve: {
            exportConditions: ["solid"],
        },
    };

    const config: BuildConfig = {
        externals: ["solid-js", "solid-js/web", "solid-js/store"],
        hooks: {
            "rollup:options": (context, _rollupOptions) => {
                // Add replace/define values based on runtime and environment
                const environment = context.environment === "development" ? "development" : "production";
                const isDev = environment === "development";
                const { runtime } = context.options;
                const isServer = runtime === "node";

                if (!context.options.rollup.replace) {
                    context.options.rollup.replace = {
                        preventAssignment: true,
                        values: {},
                    };
                }

                if (!context.options.rollup.replace.values) {
                    context.options.rollup.replace.values = {};
                }

                const replaceValues: Record<string, string | boolean> = {
                    [["import", "meta", "env", "DEV"].join(".")]: isDev,
                    [["import", "meta", "env", "NODE_ENV"].join(".")]: JSON.stringify(environment),
                    [["import", "meta", "env", "PROD"].join(".")]: !isDev,
                    [["import", "meta", "env", "SSR"].join(".")]: isServer,
                    [["process", "env", "DEV"].join(".")]: JSON.stringify(String(isDev)),
                    [["process", "env", "NODE_ENV"].join(".")]: JSON.stringify(environment),
                    [["process", "env", "PROD"].join(".")]: JSON.stringify(String(!isDev)),
                    [["process", "env", "SSR"].join(".")]: JSON.stringify(String(isServer)),
                };

                Object.assign(context.options.rollup.replace.values, replaceValues);
            },
        },
        rollup: rollupConfig,
        validation: {
            dependencies: {
                hoisted: {
                    exclude: [],
                },
                unused: {
                    exclude: ["solid-js"],
                },
            },
        },
    };

    return config;
};
