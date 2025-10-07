import type { RollupAliasOptions } from "@rollup/plugin-alias";
import type { RollupCommonJSOptions } from "@rollup/plugin-commonjs";
import type { RollupJsonOptions } from "@rollup/plugin-json";
import type { RollupNodeResolveOptions } from "@rollup/plugin-node-resolve";
import type { RollupReplaceOptions } from "@rollup/plugin-replace";
import type { RollupWasmOptions } from "@rollup/plugin-wasm";
import type { FilterPattern } from "@rollup/pluginutils";
import type { OutputOptions, Plugin, RollupOptions } from "rollup";
import type { Options as RollupDtsOptions } from "rollup-plugin-dts";
import type { NodePolyfillsOptions } from "rollup-plugin-polyfill-node";
import type { PureAnnotationsOptions } from "rollup-plugin-pure";
import type { PluginVisualizerOptions } from "rollup-plugin-visualizer";

import type { CJSInteropOptions } from "./plugins/cjs-interop";
import type { CopyPluginOptions } from "./plugins/copy";
import type { DataUriPluginOptions } from "./plugins/data-uri";
import type { DebarrelPluginOptions } from "./plugins/debarrel";
import type { EsbuildPluginConfig, Options as EsbuildOptions } from "./plugins/esbuild/types";
import type { EsmShimCjsSyntaxOptions } from "./plugins/esm-shim-cjs-syntax";
import type { IsolatedDeclarationsOptions } from "./plugins/isolated-declarations";
import type { JSXRemoveAttributesPlugin } from "./plugins/jsx-remove-attributes";
import type { LicenseOptions } from "./plugins/license";
import type { NativeModulesOptions } from "./plugins/native-modules-plugin";
import type { InternalOXCTransformPluginConfig, OxcResolveOptions, OXCTransformPluginConfig } from "./plugins/oxc/types";
import type { RawLoaderOptions } from "./plugins/raw";
import type { Options as RequireCJSPluginOptions } from "./plugins/require-cjs-transformer";
import type { ShebangOptions } from "./plugins/shebang";
import type { SourcemapsPluginOptions } from "./plugins/source-maps";
import type { SucrasePluginConfig } from "./plugins/sucrase";
import type { SwcPluginConfig } from "./plugins/swc/types";
import type { PatchTypesOptions } from "./plugins/typescript/patch-typescript-types";
import type { TsconfigPathsPluginOptions } from "./plugins/typescript/resolve-tsconfig-paths-plugin";
import type { UrlOptions } from "./plugins/url";

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

export interface IsolatedDeclarationsResult {
    errors: string[];
    map?: string;
    sourceText: string;
}

export type IsolatedDeclarationsTransformer = (code: string, id: string, sourceMap?: boolean) => Promise<IsolatedDeclarationsResult>;

export interface PackemRollupOptions {
    alias: RollupAliasOptions | false;
    cjsInterop?: CJSInteropOptions;
    commonjs: RollupCommonJSOptions | false;
    copy?: CopyPluginOptions | false;
    dataUri?: DataUriPluginOptions | false;
    debarrel?: DebarrelPluginOptions | false;
    dts: RollupDtsOptions;
    dynamicVars?: RollupDynamicImportVariablesOptions | false;
    esbuild?: EsbuildOptions | false;
    experimental?: {
        resolve?: OxcResolveOptions | false;
    };
    isolatedDeclarations?: IsolatedDeclarationsOptions;
    json: RollupJsonOptions | false;
    jsxRemoveAttributes?: JSXRemoveAttributesPlugin | false;
    license?: LicenseOptions | false;
    metafile?: boolean;
    nativeModules?: NativeModulesOptions | false;
    output?: OutputOptions;
    oxc?: Omit<OXCTransformPluginConfig, "cwd" | "sourcemap" | "target"> | false;
    patchTypes: PatchTypesOptions | false;
    pluginPure?: Omit<PureAnnotationsOptions, "sourcemap"> | false;
    plugins?: RollupPlugins;
    polyfillNode?: NodePolyfillsOptions | false;
    preserveDirectives?: {
        directiveRegex?: RegExp;
        exclude?: FilterPattern;
        include?: FilterPattern;
    };
    preserveDynamicImports?: boolean;
    raw?: RawLoaderOptions | false;
    replace: Omit<RollupReplaceOptions, "cwd"> | false;
    requireCJS?: RequireCJSPluginOptions | false;

    resolve: RollupNodeResolveOptions | false;
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

export type TransformerFn = ((config: EsbuildPluginConfig | InternalOXCTransformPluginConfig | SucrasePluginConfig | SwcPluginConfig) => Plugin) & {
    NAME?: TransformerName;
};

export type TransformerName = "esbuild" | "oxc" | "sucrase" | "swc";
