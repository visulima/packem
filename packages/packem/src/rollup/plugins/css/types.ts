import type { Options } from "cssnano";
import type { CustomAtRules, TransformOptions } from "lightningcss";
import type { Plugin, ProcessOptions, Transformer } from "postcss";
import type Processor from "postcss/lib/processor";

import type { LESSLoaderOptions } from "./loaders/less";
import type { ImportOptions } from "./loaders/postcss/import";
import type { ModulesOptions } from "./loaders/postcss/modules";
import type { UrlOptions } from "./loaders/postcss/url";
import type { SassLoaderOptions } from "./loaders/sass";
import type { StylusLoaderOptions } from "./loaders/stylus";
import type { Loader, SourceMapOptions } from "./loaders/types";
import type { Minifier } from "./minifiers/types";

interface PostCSSOptions {
    /**
     * Enable/disable or pass options for PostCSS config loader
     * @default {}
     */
    config?: PostCSSConfigLoaderOptions | false;
    /**
     * Enable/disable or pass options for CSS `@import` resolver
     * @default true
     */
    import?: ImportOptions | boolean;
    /**
     * Enable/disable or pass options for
     * [CSS Modules](https://github.com/css-modules/css-modules)
     * @default false
     */
    modules?: ModulesOptions | false;
    /**
     * Set PostCSS parser, e.g. `sugarss`.
     * Overrides the one loaded from PostCSS config file, if any.
     */
    parser?: ProcessOptions["parser"] | string;
    /**
     * A list of plugins for PostCSS,
     * which are used before plugins loaded from PostCSS config file, if any
     */
    plugins?: (Plugin | Transformer | Processor)[];
    /**
     * Set PostCSS stringifier.
     * Overrides the one loaded from PostCSS config file, if any.
     */
    stringifier?: ProcessOptions["stringifier"] | string;
    /**
     * Set PostCSS syntax.
     * Overrides the one loaded from PostCSS config file, if any.
     */
    syntax?: ProcessOptions["syntax"] | string;
    /** `to` option for PostCSS, required for some plugins */
    to?: ProcessOptions["to"];
    /**
     * Enable/disable or pass options for CSS URL resolver
     * @default true
     */
    url?: UrlOptions | boolean;
}

/** Options for PostCSS config loader */
export interface PostCSSConfigLoaderOptions {
    /**
     * Context object passed to PostCSS config file
     * @default {}
     */
    ctx?: Record<string, unknown>;
    /** Path to PostCSS config file directory */
    path?: string;
}

export interface InternalStyleOptions extends StyleOptions {
    /** @see {@link StyleOptions.mode} */
    emit: boolean;
    extensions: NonNullable<StyleOptions["extensions"]>;
    /** @see {@link StyleOptions.mode} */
    extract: boolean | string;
    /** @see {@link StyleOptions.mode} */
    inject: InjectOptions | boolean | ((varname: string, id: string, output: string[]) => string);
}

/** CSS data for extraction */
export interface ExtractedData {
    /** CSS */
    css: string;
    /** Sourcemap */
    map?: string;
    /** Output name for CSS */
    name: string;
}

/** Options for CSS injection */
export interface InjectOptions {
    /**
     * Set attributes of injected `<style>` tag(s)
     * - ex.: `{"id":"global"}`
     */
    attributes?: Record<string, string>;
    /**
     * Container for `<style>` tag(s) injection
     * @default "head"
     */
    container?: string;
    /**
     * Insert `<style>` tag(s) to the beginning of the container
     * @default false
     */
    prepend?: boolean;
    /**
     * Inject CSS into single `<style>` tag only
     * @default false
     */
    singleTag?: boolean;
    /**
     * Makes injector treeshakeable,
     * as it is only called when either classes are referenced directly,
     * or `inject` function is called from the default export.
     *
     * Incompatible with `namedExports` option.
     */
    treeshakeable?: boolean;
}

export type AutoModules = RegExp | boolean | ((id: string) => boolean);

/** `rollup-plugin-styles`'s full option list */
export interface StyleOptions {
    /**
     * Aliases for URL and import paths
     * - ex.: `{"foo":"bar"}`
     * @default {}
     */
    alias?: Record<string, string>;
    /**
     * Automatically enable
     * [CSS Modules](https://github.com/css-modules/css-modules)
     * for files named `[name].module.[ext]`
     * (e.g. `foo.module.css`, `bar.module.stylus`),
     * or pass your own function or regular expression
     * @default false
     */
    autoModules?: AutoModules;
    /**
     * Options for cssnano minifier
     * @default {}
     */
    cssnano?: Options;
    /**
     * Generate TypeScript declarations files for input style files
     */
    dts?: boolean;
    /** Files to exclude from processing */
    exclude?: ReadonlyArray<RegExp | string> | RegExp | string | null;
    /**
     * Plugin will process files ending with these extensions
     * @default [".css", ".pcss", ".postcss", ".sss"]
     */
    extensions?: string[];
    /** Files to include for processing */
    include?: ReadonlyArray<RegExp | string> | RegExp | string | null;
    /** Options for Less loader */
    less?: LESSLoaderOptions;
    lightningcss?: {
        modules?: {
            /**
             * Files to include for [CSS Modules](https://github.com/css-modules/css-modules)
             * for files named `[name].module.[ext]`
             * (e.g. `foo.module.css`, `bar.module.stylus`),
             * or pass your own function or regular expression
             * @default false
             */
            include?: AutoModules;
        };
    } & Omit<TransformOptions<CustomAtRules>, "filename" | "code" | "minify" | "targets">;
    /** Array of custom loaders */
    loaders?: Loader[];
    /** Enable the css minifier */
    minifier?: Minifier;
    /**
     * Select mode for this plugin:
     * - `"inject"` *(default)* - Embeds CSS inside JS and injects it into `<head>` at runtime.
     * You can also pass options for CSS injection.
     * Alternatively, you can pass your own CSS injector.
     * - `"extract"` - Extract CSS to the same location where JS file is generated but with `.css` extension.
     * You can also set extraction path manually,
     * relative to output dir/output file's basedir,
     * but not outside of it.
     * - `"emit"` - Emit pure processed CSS and pass it along the build pipeline.
     * Useful if you want to preprocess CSS before using it with CSS consuming plugins.
     * @default "inject"
     */
    mode?: "emit" | "extract" | "inject" | ["extract", string] | ["inject", InjectOptions | ((varname: string, id: string) => string)];
    /**
     * Use named exports alongside default export.
     * You can pass a function to control how exported name is generated.
     * @default false
     */
    namedExports?: boolean | ((name: string) => string);
    /**
     * Function which is invoked on CSS file extraction.
     * Return `boolean` to control if file should be extracted or not.
     */
    onExtract?: (data: ExtractedData) => boolean;
    /**
     * Function which is invoked on CSS file import,
     * before any transformations are applied
     */
    onImport?: (code: string, id: string) => void;
    /**
     * Options for PostCSS
     */
    postcss?: PostCSSOptions;
    /** Options for Sass loader */
    sass?: SassLoaderOptions;
    /**
     * Enable/disable or configure sourcemaps
     * @default false
     */
    sourceMap?: boolean | "inline" | [boolean | "inline", SourceMapOptions] | [boolean | "inline"];
    /** Options for Stylus loader */
    stylus?: StylusLoaderOptions;
}
