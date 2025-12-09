import type { BuildConfig } from "../../types";
import Vue from "unplugin-vue/rollup";

export interface VuePresetOptions {
    /**
     * Vue plugin options
     */
    pluginOptions?: {
        /**
         * Enable custom elements mode
         * @default false
         */
        customElement?: boolean;

        /**
         * Exclude patterns for Vue files
         */
        exclude?: RegExp | RegExp[];

        /**
         * Include patterns for Vue files
         * @default [/\.vue$/]
         */
        include?: RegExp | RegExp[];

        /**
         * Template compiler options
         */
        template?: {
            compilerOptions?: {
                [key: string]: unknown;
                isCustomElement?: (tag: string) => boolean;
            };
        };
    };
}

/**
 * Vue preset for Packem. Configures Rollup with unplugin-vue.
 * @description This preset configures the Vue plugin to handle .vue file compilation.
 * @example
 * ```typescript
 * // Basic usage
 * export default defineConfig({
 *   preset: "vue"
 * });
 *
 * // With custom options
 * import { createVuePreset } from "@visulima/packem/config/preset/vue";
 * export default defineConfig({
 *   preset: createVuePreset({
 *     pluginOptions: {
 *       customElement: true
 *     }
 *   })
 * });
 * ```
 */
export const createVuePreset = (options: VuePresetOptions = {}): BuildConfig => {
    const { pluginOptions = {} } = options;

    return {
        rollup: {
            plugins: [
                {
                    enforce: "pre",
                    plugin: Vue({
                        customElement: pluginOptions.customElement ?? false,
                        exclude: pluginOptions.exclude,
                        include: pluginOptions.include ?? [/\.vue$/],
                        template: pluginOptions.template,
                        exportMode: "default",
                    }),
                },
            ],
        },
        validation: {
            dependencies: {
                hoisted: {
                    exclude: [],
                },
                unused: {
                    exclude: ["vue"],
                },
            },
        },
    };
};
