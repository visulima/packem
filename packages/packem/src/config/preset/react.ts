import type { BabelPluginConfig } from "@visulima/packem-plugins/babel";

import type { BuildConfig } from "../../types";

export interface ReactPresetOptions {
    /**
     * Enable React Compiler optimization
     * @default false
     */
    compiler?:
        | boolean
        | {
              /**
               * React Compiler compilation mode
               * @default "infer"
               */
              compilationMode?: "infer" | "annotation";

              /**
               * React Compiler panic threshold
               * @default "critical_errors"
               */
              panicThreshold?: "critical_errors" | "all_errors";
          };

    /**
     * Custom Babel plugins to add
     */
    plugins?: NonNullable<BabelPluginConfig["plugins"]>;

    /**
     * Custom Babel presets to add
     */
    presets?: NonNullable<BabelPluginConfig["presets"]>;
}

/**
 * React preset for Packem. Configures Babel with React presets and optionally React Compiler.
 * @description This preset configures Babel to run before your main transformer (esbuild/SWC/etc.).
 * Babel handles JSX transformation, while TypeScript is handled by the transformer via parser plugins.
 * This matches the approach used by `@vitejs/plugin-react`.
 * @example
 * ```typescript
 * // Basic usage
 * export default defineConfig({
 *   preset: "react"
 * });
 *
 * // With React Compiler
 * import { createReactPreset } from "@visulima/packem/config/preset/react";
 * export default defineConfig({
 *   preset: createReactPreset({
 *     compiler: true
 *   })
 * });
 *
 * // With custom options
 * export default defineConfig({
 *   preset: createReactPreset({
 *     compiler: {
 *       compilationMode: "annotation"
 *     }
 *   })
 * });
 * ```
 */
export const createReactPreset = (options: ReactPresetOptions = {}): BuildConfig => {
    const { compiler, plugins, presets } = options;

    const babelPlugins: BabelPluginConfig["plugins"] = [];
    const babelPresets: BabelPluginConfig["presets"] = [];

    if (compiler) {
        const compilerOptions = typeof compiler === "object" ? compiler : {};

        babelPlugins.push([
            "babel-plugin-react-compiler",
            {
                compilationMode: compilerOptions.compilationMode ?? "infer",
                panicThreshold: compilerOptions.panicThreshold ?? "critical_errors",
            },
        ]);
    }

    babelPresets.push([
        "@babel/preset-react",
        {
            runtime: "automatic",
        },
    ]);

    const finalPlugins = [...babelPlugins, ...(Array.isArray(plugins) ? plugins : [])];
    const finalPresets = [...babelPresets, ...(Array.isArray(presets) ? presets : [])];

    return {
        hooks: {
            "rollup:options": (context, _rollupOptions) => {
                const babelConfig = context.options.rollup.babel;

                if (babelConfig && typeof babelConfig === "object" && babelConfig.presets) {
                    const presetIndex = babelConfig.presets.findIndex((preset) => Array.isArray(preset) && preset[0] === "@babel/preset-react");

                    if (presetIndex !== -1) {
                        const preset = babelConfig.presets[presetIndex] as [string, Record<string, unknown>];

                        babelConfig.presets[presetIndex] = [
                            preset[0],
                            {
                                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `typeof x === "object"` is also true for null, so the explicit null check is a real runtime guard; relaxed strictNullChecks hides the union from the type checker.
                                ...(typeof preset[1] === "object" && preset[1] !== null && preset[1]),
                                development: context.environment === "development",
                            },
                        ];
                    }
                }
            },
        },
        rollup: {
            babel: {
                plugins: finalPlugins.length > 0 ? finalPlugins : undefined,
                presets: finalPresets.length > 0 ? finalPresets : undefined,
            },
        },
        validation: {
            dependencies: {
                hoisted: {
                    exclude: [],
                },
                unused: {
                    exclude: ["react", "react-dom"],
                },
            },
        },
    };
};
