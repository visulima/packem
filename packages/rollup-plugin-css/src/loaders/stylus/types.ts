import type { Environment } from "@visulima/packem-share/types";
import type { RenderOptions } from "stylus";

/**
 * Minimal context passed to `additionalData` functions.
 */
export type StylusLoaderContext = {
    environment: Environment;
    resourcePath: string;
    rootContext: string;
};

/**
 * Stylus plugin: either a function that receives the renderer,
 * or a module id (string) that resolves to a plugin factory.
 */
export type StylusPlugin = string | ((renderer: unknown) => void);

/**
 * Definition entry: `[name, value]` or `[name, value, raw]`.
 */
export type StylusDefinition = [string, unknown] | [string, unknown, boolean];

/**
 * Configuration options for the Stylus loader.
 *
 * Extends the standard Stylus RenderOptions with loader-specific functionality.
 * These options are passed to the Stylus compiler during processing.
 * @example
 * ```typescript
 * const stylusOptions: StylusLoaderOptions = {
 *   paths: ['./styles', './node_modules'],
 *   define: { 'primary-color': '#007acc' },
 *   import: ['nib'],
 *   use: ['nib'],
 *   compress: true,
 * };
 * ```
 * @see {@link https://stylus-lang.com/docs/js.html} Stylus.js API Documentation
 */
export type StylusLoaderOptions = {
    /**
     * Prepends or appends Stylus code to the entry file before compilation.
     * Useful for injecting shared variables, mixins, or plugin imports.
     */
    additionalData?:
        | string
        | ((content: string, loaderContext: StylusLoaderContext) => Promise<string> | string);

    /**
     * Disable stylus internal cache.
     */
    disableCache?: boolean;

    /**
     * Hoist `@import`/`@charset` at-rules to the top of the file
     * (maps to stylus `hoist atrules`).
     */
    hoistAtrules?: boolean;

    /**
     * Custom stylus implementation. Either a module id to import,
     * or a pre-imported Stylus function.
     */
    implementation?: string | ((code: string, options?: unknown) => unknown);

    /**
     * Files to pre-import before compiling. Equivalent to calling
     * `.import()` on the renderer for each entry.
     */
    import?: string[];

    /**
     * Additional include paths. Equivalent to calling `.include()`
     * on the renderer for each entry.
     */
    include?: string[];

    /**
     * Include regular CSS on `@import` (maps to stylus `include css`).
     */
    includeCSS?: boolean;

    /**
     * Emit comments in the generated CSS indicating the corresponding
     * stylus line (maps to stylus `linenos`).
     */
    lineNumbers?: boolean;

    /**
     * Pre-define variables/functions on the renderer.
     * Accepts either a plain object keyed by name or a list of
     * `[name, value]` / `[name, value, raw]` tuples.
     */
    define?: Record<string, unknown> | StylusDefinition[];

    /**
     * Stylus plugins to apply via `.use()`.
     * Strings are resolved and required relative to the current working directory.
     */
    use?: StylusPlugin[];
} & RenderOptions;
