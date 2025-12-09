import type { BuildConfig } from "../../types";
import svelte from "rollup-plugin-svelte";
import { DEFAULT_EXTENSIONS } from "@visulima/packem-share/constants";

export interface SveltePresetOptions {
    /**
     * Svelte plugin options
     */
    pluginOptions?: {
        /**
         * Svelte compiler options
         */
        compilerOptions?: {
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

            [key: string]: unknown;
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
                        extensions: [".svelte"],
                        exclude: pluginOptions.exclude,
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
