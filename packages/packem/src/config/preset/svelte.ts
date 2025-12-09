import { DEFAULT_EXTENSIONS } from "@visulima/packem-share/constants";
import svelte from "rollup-plugin-svelte";

import type { BuildConfig } from "../../types";

export interface SveltePresetOptions {
    /**
     * Svelte plugin options
     */
    pluginOptions?: {
        /**
         * Svelte compiler options
         */
        compilerOptions?: {
            [key: string]: unknown;

            /**
             * Custom element mode
             * @default false
             */
            customElement?: boolean;

            /**
             * Enable dev mode
             * @default false
             */
            dev?: boolean;

            /**
             * Generate mode: "client" for client-side rendering, "server" for SSR
             * @default "client"
             */
            generate?: "client" | "server" | false;

            /**
             * Enable hydratable output
             * @default false
             */
            hydratable?: boolean;
        };

        /**
         * Exclude patterns for Svelte files
         */
        exclude?: RegExp | RegExp[];

        /**
         * Include patterns for Svelte files
         * @default [/\.svelte$/]
         */
        include?: RegExp | RegExp[];

        /**
         * Preprocessor options
         */
        preprocess?: unknown;
    };
}

/**
 * Svelte preset for Packem. Configures Rollup with rollup-plugin-svelte.
 * @description This preset configures the Svelte plugin to handle .svelte file compilation.
 * @example
 * ```typescript
 * // Basic usage
 * export default defineConfig({
 *   preset: "svelte"
 * });
 *
 * // With custom options
 * import { createSveltePreset } from "@visulima/packem/config/preset/svelte";
 * export default defineConfig({
 *   preset: createSveltePreset({
 *     pluginOptions: {
 *       compilerOptions: {
 *         hydratable: true
 *       }
 *     }
 *   })
 * });
 * ```
 */
export const createSveltePreset = (options: SveltePresetOptions = {}): BuildConfig => {
    const { pluginOptions = {} } = options;

    return {
        rollup: {
            plugins: [
                {
                    enforce: "pre",
                    plugin: svelte({
                        compilerOptions: {
                            generate: "client",
                            runes: true,
                            ...pluginOptions.compilerOptions,
                        },
                        emitCss: false,
                        exclude: pluginOptions.exclude,
                        extensions: [".svelte"],
                        include: pluginOptions.include ?? [/\.svelte$/],
                        preprocess: pluginOptions.preprocess,
                    }),
                },
            ],
            resolve: {
                browser: true,
                exportConditions: ["svelte"],
                extensions: [...DEFAULT_EXTENSIONS, ".svelte"],
            },
        },
        validation: {
            dependencies: {
                hoisted: {
                    exclude: [],
                },
                unused: {
                    exclude: ["svelte"],
                },
            },
        },
    };
};
