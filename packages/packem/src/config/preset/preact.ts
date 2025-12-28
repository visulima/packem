import type { BabelPluginConfig } from "@visulima/packem-rollup/babel";
import type { Plugin } from "rollup";

import type { BuildConfig } from "../../types";

/**
 * Preact preset for Packem. Configures Babel with React preset using Preact as the JSX import source.
 * @description This preset configures Babel to run before your main transformer (esbuild/SWC/etc.).
 * Babel handles JSX transformation with Preact's automatic runtime, while TypeScript is handled by the transformer via parser plugins.
 * This matches the approach used by `@preact/preset-vite`. The preset automatically injects Preact devtools and configures aliases to map `react` and `react-dom` to `preact/compat`.
 * @example
 * ```typescript
 * // Basic usage (devtools enabled in development)
 * export default defineConfig({
 *   preset: "preact"
 * });
 *
 * // With devtools enabled in production
 * import { createPreactPreset } from "@visulima/packem/config/preset/preact";
 * export default defineConfig({
 *   preset: createPreactPreset({
 *     devtoolsInProd: true
 *   })
 * });
 *
 * // With custom Babel options
 * export default defineConfig({
 *   preset: createPreactPreset({
 *     plugins: [],
 *     presets: []
 *   })
 * });
 * ```
 *
 * Creates a Rollup plugin that injects Preact devtools into entry files.
 * Based on @preact/preset-vite's devtools plugin.
 * @see https://github.com/preactjs/preset-vite/blob/main/src/devtools.ts
 */

/**
 * Creates a Rollup plugin that rewrites React imports to Preact/compat in source code.
 * This ensures import statements are rewritten even when modules are external.
 */
const createPreactAliasTransformPlugin = (): Plugin => {
    return {
        name: "packem:preact-alias-transform",

        transform(code, id) {
            // Only transform source files, not node_modules
            if (id.includes("/node_modules/")) {
                return undefined;
            }

            let modified = false;
            let transformedCode = code;

            // Rewrite react imports to preact/compat
            if (transformedCode.includes("from \"react\"") || transformedCode.includes("from 'react'")) {
                transformedCode = transformedCode.replaceAll(/from\s+["']react["']/g, "from \"preact/compat\"");
                modified = true;
            }

            // Rewrite react-dom imports to preact/compat
            if (transformedCode.includes("from \"react-dom\"") || transformedCode.includes("from 'react-dom'")) {
                transformedCode = transformedCode.replaceAll(/from\s+["']react-dom["']/g, "from \"preact/compat\"");
                modified = true;
            }

            // Rewrite react-dom/test-utils imports to preact/test-utils
            if (transformedCode.includes("from \"react-dom/test-utils\"") || transformedCode.includes("from 'react-dom/test-utils'")) {
                transformedCode = transformedCode.replaceAll(/from\s+["']react-dom\/test-utils["']/g, "from \"preact/test-utils\"");
                modified = true;
            }

            // Rewrite react-dom/client imports to preact/compat
            if (transformedCode.includes("from \"react-dom/client\"") || transformedCode.includes("from 'react-dom/client'")) {
                transformedCode = transformedCode.replaceAll(/from\s+["']react-dom\/client["']/g, "from \"preact/compat\"");
                modified = true;
            }

            // Rewrite react/jsx-runtime imports to preact/jsx-runtime
            if (transformedCode.includes("from \"react/jsx-runtime\"") || transformedCode.includes("from 'react/jsx-runtime'")) {
                transformedCode = transformedCode.replaceAll(/from\s+["']react\/jsx-runtime["']/g, "from \"preact/jsx-runtime\"");
                modified = true;
            }

            if (!modified) {
                return undefined;
            }

            return {
                code: transformedCode,
                map: undefined,
            };
        },
    };
};

const createPreactDevtoolsPlugin = (devtoolsInProduction: boolean, isProduction: boolean): Plugin => {
    return {
        name: "packem:preact-devtools",

        transform(code, id) {
            const moduleInfo = this.getModuleInfo(id);

            // Only inject into entry files
            if (!moduleInfo?.isEntry) {
                return undefined;
            }

            // Only inject in development or if explicitly enabled for production
            if (isProduction && !devtoolsInProduction) {
                return undefined;
            }

            // Check if devtools is already imported
            if (code.includes("preact/debug") || code.includes("preact/devtools")) {
                return undefined;
            }

            // Inject the import at the top of the file
            const source = isProduction ? "preact/devtools" : "preact/debug";
            const injectedCode = `import "${source}";\n${code}`;

            return {
                code: injectedCode,
                map: undefined,
            };
        },
    };
};

export interface PreactPresetOptions {
    /**
     * Enable Preact devtools in production builds
     * @default false
     */
    devtoolsInProd?: boolean;

    /**
     * Custom Babel plugins to add
     */
    plugins?: BabelPluginConfig["plugins"];

    /**
     * Custom Babel presets to add
     */
    presets?: BabelPluginConfig["presets"];
}

export const createPreactPreset = (options: PreactPresetOptions = {}): BuildConfig => {
    const { devtoolsInProd: devtoolsInProduction = false, plugins = [], presets = [] } = options;

    const babelPlugins: BabelPluginConfig["plugins"] = [];
    const babelPresets: BabelPluginConfig["presets"] = [
        [
            "@babel/preset-react",
            {
                importSource: "preact",
                runtime: "automatic",
            },
        ],
    ];

    // Add hook names plugin in development mode for better Devtools experience
    // This plugin enhances Preact Devtools by adding hook names
    babelPlugins.push("babel-plugin-transform-hook-names");

    const finalPlugins = [...babelPlugins, ...Array.isArray(plugins) ? plugins : []];
    const finalPresets = [...babelPresets, ...Array.isArray(presets) ? presets : []];

    return {
        hooks: {
            "rollup:options": (context, rollupOptions) => {
                // Only add plugin when we have actual rollup options (not the dummy object)
                // Check if rollupOptions has meaningful properties
                if (!rollupOptions.input && !rollupOptions.plugins) {
                    return;
                }

                const isProduction = context.environment === "production";

                // Add to plugins array
                if (!Array.isArray(rollupOptions.plugins)) {
                    // eslint-disable-next-line no-param-reassign
                    rollupOptions.plugins = [];
                }

                // Add alias transform plugin (runs early to rewrite imports in source code)
                const aliasTransformPlugin = createPreactAliasTransformPlugin();
                const aliasTransformExists = rollupOptions.plugins.some(
                    (p: unknown) =>
                        (typeof p === "object" && p !== null && "name" in p && (p as { name: string }).name === "packem:preact-alias-transform")
                        || (Array.isArray(p)
                            && p[0]
                            && typeof p[0] === "object"
                            && p[0] !== null
                            && "name" in p[0]
                            && (p[0] as { name: string }).name === "packem:preact-alias-transform"),
                );

                if (!aliasTransformExists) {
                    // Insert early in the plugin chain (before babel/transformers)
                    rollupOptions.plugins.unshift(aliasTransformPlugin);
                }

                // Create devtools plugin with current environment
                const devtoolsPlugin = createPreactDevtoolsPlugin(devtoolsInProduction, isProduction);
                const devtoolsExists = rollupOptions.plugins.some(
                    (p: unknown) =>
                        (typeof p === "object" && p !== null && "name" in p && (p as { name: string }).name === "packem:preact-devtools")
                        || (Array.isArray(p)
                            && p[0]
                            && typeof p[0] === "object"
                            && p[0] !== null
                            && "name" in p[0]
                            && (p[0] as { name: string }).name === "packem:preact-devtools"),
                );

                if (!devtoolsExists) {
                    rollupOptions.plugins.push(devtoolsPlugin);
                }
            },
        },
        rollup: {
            alias: {
                entries: [
                    {
                        find: "react",
                        replacement: "preact/compat",
                    },
                    {
                        find: "react-dom",
                        replacement: "preact/compat",
                    },
                    {
                        find: "react-dom/test-utils",
                        replacement: "preact/test-utils",
                    },
                    {
                        find: "react/jsx-runtime",
                        replacement: "preact/jsx-runtime",
                    },
                ],
            },
            babel: {
                plugins: finalPlugins.length > 0 ? finalPlugins : undefined,
                presets: finalPresets.length > 0 ? finalPresets : undefined,
            },
        },
        validation: {
            dependencies: {
                hoisted: {
                    exclude: ["react", "react-dom"],
                },
                unused: {
                    exclude: ["preact", "react", "react-dom"],
                },
            },
        },
    };
};
