import type { RollupAliasOptions } from "@rollup/plugin-alias";
import type { RollupCommonJSOptions } from "@rollup/plugin-commonjs";
import type { RollupJsonOptions } from "@rollup/plugin-json";
import type { RollupReplaceOptions } from "@rollup/plugin-replace";
import type { RollupWasmOptions } from "@rollup/plugin-wasm";
import type { FilterPattern } from "@rollup/pluginutils";
import type { BabelPluginConfig } from "@visulima/packem-plugins/babel";
import type { OXCResolveOptions, OXCTransformPluginConfig } from "@visulima/packem-plugins/oxc";
import type { CopyPluginOptions } from "@visulima/packem-plugins/plugin/copy";
import type { DataUriPluginOptions } from "@visulima/packem-plugins/plugin/data-uri";
import type { DebarrelPluginOptions } from "@visulima/packem-plugins/plugin/debarrel";
import type { DetectDuplicatedPluginOptions } from "@visulima/packem-plugins/plugin/detect-duplicated";
import type { EsmShimCjsSyntaxOptions } from "@visulima/packem-plugins/plugin/esm-shim-cjs-syntax";
import type { ResolveExternalsPluginOptions } from "@visulima/packem-plugins/plugin/externals";
import type { LicenseOptions } from "@visulima/packem-plugins/plugin/license";
import type { MinifyHTMLLiteralsOptions } from "@visulima/packem-plugins/plugin/minify-html-literals";
import type { NativeModulesOptions } from "@visulima/packem-plugins/plugin/native-modules";
import type { RawLoaderOptions } from "@visulima/packem-plugins/plugin/raw";
import type { Options as RequireCJSPluginOptions } from "@visulima/packem-plugins/plugin/require-cjs-transformer";
import type { ShebangOptions } from "@visulima/packem-plugins/plugin/shebang";
import type { SourcemapsPluginOptions } from "@visulima/packem-plugins/plugin/source-maps";
import type { UrlOptions } from "@visulima/packem-plugins/plugin/url";
import type { PatchTypesOptions, TsconfigPathsPluginOptions } from "@visulima/packem-plugins/typescript";
import type { Options as RollupDtsOptions } from "@visulima/rollup-plugin-dts";
import type { OutputOptions, Plugin, RollupOptions } from "rollup";
import type { NodePolyfillsOptions } from "rollup-plugin-polyfill-node";
import type { PureAnnotationsOptions } from "rollup-plugin-pure";
import type { PluginVisualizerOptions } from "rollup-plugin-visualizer";

import type { CJSInteropOptions } from "./plugins/cjs-interop";
import type { Options as EsbuildOptions } from "./plugins/esbuild/types";
import type { JSXRemoveAttributesPlugin } from "./plugins/jsx-remove-attributes";
import type { SucrasePluginConfig } from "./plugins/sucrase";
import type { SwcPluginConfig } from "./plugins/swc/types";

interface RollupDynamicImportVariablesOptions {
    /**
     * By default, the plugin will not throw errors when target files are not found.
     * Setting this option to true will result in errors thrown when encountering files which don't exist.
     * @default false
     */
    errorWhenNoFilesFound?: boolean;

    /**
     * A picomatch pattern, or array of patterns, which specifies the files in the build the plugin
     * should _ignore_.
     *
     * By default, no files are ignored.
     */
    exclude?: FilterPattern;

    /**
     * A picomatch pattern, or array of patterns, which specifies the files in the build the plugin
     * should operate on.
     * By default, all files are targeted.
     */
    include?: FilterPattern;

    /**
     * By default, the plugin quits the build process when it encounters an error.
     * If you set this option to true, it will throw a warning instead and leave the code untouched.
     * @default false
     */
    warnOnError?: boolean;
}

/**
 * Legacy `@rollup/plugin-node-resolve` option keys. Module resolution is now
 * handled by the oxc resolver, but these keys are still accepted and mapped onto
 * the equivalent oxc-resolver options at build time so existing configs (and the
 * svelte/solid presets) keep working. Prefer the native oxc keys
 * (`conditionNames`, `aliasFields`, …) in new configs.
 */
export interface LegacyNodeResolveOptions {
    /** Node-resolve `allowExportsFolderMapping`; ignored by the oxc resolver (dropped at build time). */
    allowExportsFolderMapping?: boolean;
    /** Node-resolve `browser`; maps to the `"browser"` condition + the `browser` alias field. */
    browser?: boolean;
    /** Node-resolve `exportConditions`; maps to (and is prepended onto) `conditionNames`. */
    exportConditions?: string[];

    /**
     * Node-resolve `preferBuiltins`. Node builtins are externalized by the externals
     * plugin, so this is dropped before reaching the oxc resolver; it is retained as a
     * config key only because the build runtime still sets it from `runtime`.
     */
    preferBuiltins?: boolean;
}

/**
 * Module-resolution options, passed to the oxc-resolver-backed resolve plugin.
 * Accepts the native oxc-resolver options plus a few legacy node-resolve keys
 * ({@link LegacyNodeResolveOptions}) that are mapped onto their oxc equivalents.
 */
export type ResolveOptions = LegacyNodeResolveOptions
    & OXCResolveOptions & {
        /**
         * Controls how unresolved imports are handled.
         * - `"error"` (default): treat unresolved imports as errors, failing the build.
         * - `"warn"`: emit a warning and continue.
         * @default "error"
         */
        unresolvedImportBehavior?: "error" | "warn";
    };

export interface PackemRollupOptions {
    alias?: RollupAliasOptions | false;
    babel?: BabelPluginConfig | false;
    cjsInterop?: CJSInteropOptions;
    commonjs?: RollupCommonJSOptions | false;
    copy?: CopyPluginOptions | false;
    dataUri?: DataUriPluginOptions | false;
    debarrel?: DebarrelPluginOptions | false;

    /**
     * Detect dependencies that get bundled more than once (multiple versions, or
     * the same version from multiple directories) and report them. Enabled by
     * default; set to `false` to disable, or pass options to configure.
     */
    detectDuplicated?: DetectDuplicatedPluginOptions | false;
    dts?: RollupDtsOptions;
    dynamicVars?: RollupDynamicImportVariablesOptions | false;
    esbuild?: EsbuildOptions | false;
    json?: RollupJsonOptions | false;
    jsxRemoveAttributes?: JSXRemoveAttributesPlugin | false;
    license?: LicenseOptions | false;
    metafile?: boolean;
    minifyHTMLLiterals?: MinifyHTMLLiteralsOptions | false;
    nativeModules?: NativeModulesOptions | false;
    output?: OutputOptions;
    oxc?: Omit<OXCTransformPluginConfig, "cwd" | "sourcemap" | "target"> | false;
    patchTypes?: PatchTypesOptions | false;
    plugins?: RollupPlugins;
    polyfillNode?: NodePolyfillsOptions | false;
    preserveDirectives?: {
        directiveRegex?: RegExp;
        exclude?: FilterPattern;
        include?: FilterPattern;
    };
    preserveDynamicImports?: boolean;
    pure?: Omit<PureAnnotationsOptions, "sourcemap"> | false;
    raw?: RawLoaderOptions | false;
    replace?: Omit<RollupReplaceOptions, "cwd"> | false;
    requireCJS?: RequireCJSPluginOptions | false;
    resolve?: ResolveOptions | false;
    resolveExternals?: ResolveExternalsPluginOptions;
    shebang?: Partial<ShebangOptions> | false;
    shim?: EsmShimCjsSyntaxOptions | false;
    sourcemap?: SourcemapsPluginOptions;
    sucrase?: SucrasePluginConfig | false;
    swc?: SwcPluginConfig | false;
    treeshake?: RollupOptions["treeshake"];
    tsconfigPaths?: TsconfigPathsPluginOptions | false;
    url?: UrlOptions | false;
    visualizer?: PluginVisualizerOptions | false;
    wasm?: RollupWasmOptions | false;
    watch?: RollupOptions["watch"];
}

export type RollupPlugins = {
    enforce?: "post" | "pre";
    plugin: Plugin;
    type?: "build" | "dts";
}[];
