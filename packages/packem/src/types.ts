import type { RollupAliasOptions } from "@rollup/plugin-alias";
import type { RollupCommonJSOptions } from "@rollup/plugin-commonjs";
import type { RollupJsonOptions } from "@rollup/plugin-json";
import type { RollupNodeResolveOptions } from "@rollup/plugin-node-resolve";
import type { RollupReplaceOptions } from "@rollup/plugin-replace";
import type { RollupWasmOptions } from "@rollup/plugin-wasm";
import type { FilterPattern } from "@rollup/pluginutils";
import type { PackageJson } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { Hookable } from "hookable";
import type { Jiti, JitiOptions } from "jiti";
import type { OutputOptions, Plugin, RollupBuild, RollupOptions, RollupWatcher } from "rollup";
import type { Options as RollupDtsOptions } from "rollup-plugin-dts";
import type { NodePolyfillsOptions } from "rollup-plugin-polyfill-node";
import type { PluginVisualizerOptions } from "rollup-plugin-visualizer";
import type { TypeDocOptions as BaseTypeDocumentOptions } from "typedoc";

import type { CJSInteropOptions } from "./rollup/plugins/cjs-interop";
import type { CopyPluginOptions } from "./rollup/plugins/copy";
import type { StyleOptions } from "./rollup/plugins/css/types";
import type { EsbuildPluginConfig, Options as EsbuildOptions } from "./rollup/plugins/esbuild/types";
import type { EsmShimCjsSyntaxOptions } from "./rollup/plugins/esm-shim-cjs-syntax";
import type { IsolatedDeclarationsOptions } from "./rollup/plugins/isolated-declarations";
import type { JSXRemoveAttributesPlugin } from "./rollup/plugins/jsx-remove-attributes";
import type { LicenseOptions } from "./rollup/plugins/license";
import type { RawLoaderOptions } from "./rollup/plugins/raw";
import type { ShebangOptions } from "./rollup/plugins/shebang";
import type { SucrasePluginConfig } from "./rollup/plugins/sucrase/types";
import type { SwcPluginConfig } from "./rollup/plugins/swc/types";
import type { PatchTypesOptions } from "./rollup/plugins/typescript/patch-typescript-types";
import type FileCache from "./utils/file-cache";
import type { UrlOptions } from "./rollup/plugins/url";
import type { SourcemapsPluginOptions } from "./rollup/plugins/source-maps";
import type { ResolveExternalsPluginOptions } from "./rollup/plugins/resolve-externals-plugin";
import type { TsconfigPathsPluginOptions } from "./rollup/plugins/typescript/resolve-tsconfig-paths-plugin";
import type { OxcResolveOptions } from "./rollup/plugins/oxc/oxc-resolve";
import type { Node10CompatibilityOptions } from "./packem/node10-compatibility";
import type { InternalOXCTransformPluginConfig, OXCTransformPluginConfig } from "./rollup/plugins/oxc/types";

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

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

export type KillSignal = "SIGKILL" | "SIGTERM";

export type Environment = "production" | "development" | undefined;

export type RollupPlugins = {
    enforce?: "pre" | "post";
    plugin: Plugin;
    type?: "build" | "dts";
}[];

export type TransformerName = "esbuild" | "sucrase" | "swc" | "oxc";

export interface RollupBuildOptions {
    alias: RollupAliasOptions | false;
    cjsInterop?: CJSInteropOptions;
    commonjs: RollupCommonJSOptions | false;
    copy?: CopyPluginOptions | false;
    css?: StyleOptions | false;
    dts: RollupDtsOptions;
    dynamicVars?: RollupDynamicImportVariablesOptions | false;
    esbuild?: EsbuildOptions | false;
    oxc?: Omit<OXCTransformPluginConfig, "cwd" | "sourcemap" | "target"> | false;
    isolatedDeclarations?: IsolatedDeclarationsOptions;
    json: RollupJsonOptions | false;
    jsxRemoveAttributes?: JSXRemoveAttributesPlugin | false;
    license?: LicenseOptions | false;
    metafile?: boolean;
    // TODO: Move this out of the `RollupBuildOptions` type
    node10Compatibility?: Node10CompatibilityOptions | false;
    output?: OutputOptions;
    patchTypes: PatchTypesOptions | false;
    plugins?: RollupPlugins;
    polyfillNode?: NodePolyfillsOptions | false;
    preserveDirectives?: {
        directiveRegex?: RegExp;
        exclude?: FilterPattern;
        include?: FilterPattern;
    };
    tsconfigPaths?: TsconfigPathsPluginOptions | false;
    preserveDynamicImports?: boolean;
    raw?: RawLoaderOptions | false;
    replace: RollupReplaceOptions | false;
    resolve: RollupNodeResolveOptions | false;
    shebang?: Partial<ShebangOptions> | false;
    shim?: EsmShimCjsSyntaxOptions | false;
    sucrase?: SucrasePluginConfig | false;
    swc?: SwcPluginConfig | false;
    treeshake?: RollupOptions["treeshake"];
    visualizer?: PluginVisualizerOptions | false;
    url?: UrlOptions | false;
    wasm?: RollupWasmOptions | false;
    watch?: RollupOptions["watch"];
    sourcemap?: SourcemapsPluginOptions;
    resolveExternals?: ResolveExternalsPluginOptions;
    experimental?: {
        resolve?: OxcResolveOptions | false;
    };
}

export type TypeDocumentOptions = {
    /**
     * The format of the output.
     *
     * @default "html"
     */
    format?: "inline" | "json" | "markdown" | "html";
    /**
     * A marker to replace the content within the file on the correct location.
     *
     * @default "TYPEDOC" This marker need to be placed in the readme <!-- TYPEDOC --><!-- TYPEDOC -->
     */
    marker?: string;
    /**
     * The path of the output directory.
     */
    output?: string;
    /**
     * The path of the README file.
     */
    readmePath?: string;
    /**
     * The name of the JSON file.
     */
    jsonFileName?: string;
} & Partial<Omit<BaseTypeDocumentOptions, "entryPoints" | "out" | "hideGenerator" | "watch" | "preserveWatchOutput">>;

export type Runtime = "react-server" | "react-native" | "edge-light" | "node" | "browser";

export type BuildEntry = {
    cjs?: boolean;
    declaration?: boolean | "compatible" | "node16";
    environment?: Environment;
    esm?: boolean;
    executable?: true;
    exportKey?: Set<string>;
    fileAlias?: string;
    input: string;
    isGlob?: boolean;
    name?: string;
    outDir?: string;
    runtime?: Runtime;
};

export type ValidationOptions = {
    packageJson?: {
        bin?: boolean;
        dependencies?: boolean;
        exports?: boolean;
        files?: boolean;
        main?: boolean;
        module?: boolean;
        name?: boolean;
        types?: boolean;
        typesVersions?: boolean;
    };
    bundleLimit?: {
        // Allow the build to succeed even if limits are exceeded
        allowFail?: boolean;
        /**
         * Bundle size limit in bytes, or string with unit (e.g., "1MB", "500KB")
         * @example
         * - "1MB"
         * - "500KB"
         * - 1048576 // 1MB in bytes
         */
        limit?: number | `${number}${"B" | "KB" | "MB" | "GB" | "TB"}`;
        // Size limits for specific files or globs
        limits?: Record<string, number | `${number}${"B" | "KB" | "MB" | "GB" | "TB"}`>;
    };
};

export type TransformerFn = ((config: SwcPluginConfig | SucrasePluginConfig | EsbuildPluginConfig | InternalOXCTransformPluginConfig) => Plugin) & { NAME?: TransformerName };

export interface BuildOptions {
    alias: Record<string, string>;
    analyze?: boolean;
    builder?: Record<string, (context: BuildContext, cachePath: string | undefined, fileCache: FileCache, logged: boolean) => Promise<void>>;
    browserTargets?: string[];
    cjsInterop?: boolean;
    clean: boolean;
    debug: boolean;
    experimental?: {
        /**
         * If `true`, the `oxc resolve` plugin will be used instead of the default `@rollup/plugin-node-resolve` and `@rollup/plugin-alias`.
         */
        oxcResolve?: boolean;
    };
    /**
     * `compatible` means "src/gather.ts" will generate "dist/index.d.mts", "dist/index.d.cts" and "dist/index.d.ts".
     * `node16` means "src/gather.ts" will generate "dist/index.d.mts" and "dist/index.d.cts".
     * `true` is equivalent to `compatible`.
     * `false` will disable declaration generation.
     * `undefined` will auto-detect based on "package.json". If "package.json" has "types" field, it will be `"compatible"`, otherwise `false`.
     */
    declaration?: boolean | "compatible" | "node16" | undefined;
    /**
     * If `true`, only generate declaration files.
     * If `false` or `undefined`, generate both declaration and source files.
     */
    dtsOnly?: boolean;
    emitCJS?: boolean;
    emitESM?: boolean;
    entries: BuildEntry[];
    externals: (RegExp | string)[];
    failOnWarn?: boolean;
    fileCache?: boolean;
    /** @experimental */
    isolatedDeclarationTransformer?: IsolatedDeclarationsTransformer;
    /**
     * Jiti options, where [jiti](https://github.com/unjs/jiti) is used to load the entry files.
     */
    jiti: Omit<JitiOptions, "onError" | "transform">;
    killSignal?: KillSignal;
    minify?: boolean | undefined;
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    onSuccess?: string | (() => Promise<void | undefined | (() => void | Promise<void>)>);
    onSuccessTimeout?: number;
    outDir: string;
    rollup: RollupBuildOptions;
    rootDir: string;
    runtime?: "node" | "browser";
    sourceDir: string;
    sourcemap: boolean;
    transformer: TransformerFn;
    typedoc: TypeDocumentOptions | false;
    validation?: false | ValidationOptions;
}

export interface BuildHooks {
    "build:before": (context: BuildContext) => Promise<void> | void;
    "build:done": (context: BuildContext) => Promise<void> | void;
    "build:prepare": (context: BuildContext) => Promise<void> | void;

    "builder:before": (name: string, context: BuildContext) => Promise<void> | void;
    "builder:done": (name: string, context: BuildContext) => Promise<void> | void;

    "rollup:build": (context: BuildContext, build: RollupBuild) => Promise<void> | void;
    "rollup:done": (context: BuildContext) => Promise<void> | void;
    "rollup:dts:build": (context: BuildContext, build: RollupBuild) => Promise<void> | void;

    "rollup:dts:done": (context: BuildContext) => Promise<void> | void;
    "rollup:dts:options": (context: BuildContext, options: RollupOptions) => Promise<void> | void;

    "rollup:options": (context: BuildContext, options: RollupOptions) => Promise<void> | void;
    "rollup:watch": (context: BuildContext, watcher: RollupWatcher) => Promise<void> | void;

    // @deprecated Use "builder:before" instead
    "typedoc:before": (context: BuildContext) => Promise<void> | void;
    // @deprecated Use "builder:done" instead
    "typedoc:done": (context: BuildContext) => Promise<void> | void;

    "validate:before": (context: BuildContext) => Promise<void> | void;
    "validate:done": (context: BuildContext) => Promise<void> | void;
}

export type BuildContextBuildEntry = {
    size?: {
        bytes?: number;
        brotli?: number;
        gzip?: number;
    };
    chunk?: boolean;
    chunks?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    type?: "entry";
};

export type BuildContextBuildAssetAndChunk = {
    size?: {
        bytes?: number;
        brotli?: number;
        gzip?: number;
    };
    chunk?: boolean;
    chunks?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    type?: "asset" | "chunk";
};

export interface InternalBuildOptions extends BuildOptions {
    transformerName: TransformerName | undefined;
    rollup: Omit<BuildOptions["rollup"], "oxc"> & { oxc?: InternalOXCTransformPluginConfig | false };
}

export interface BuildContext {
    buildEntries: (BuildContextBuildEntry | BuildContextBuildAssetAndChunk)[];
    dependencyGraphMap: Map<string, Set<[string, string]>>;
    environment: Environment;
    hooks: Hookable<BuildHooks>;
    jiti: Jiti;
    logger: Pail;
    mode: Mode;
    options: InternalBuildOptions;
    pkg: PackageJson;
    tsconfig?: TsConfigResult;
    usedImports: Set<string>;
    warnings: Set<string>;
}

export type BuildPreset = BuildConfig | (() => BuildConfig);

/**
 * In addition to basic `entries`, `presets`, and `hooks`,
 * there are also all the properties of `BuildOptions` except for BuildOption's `entries`.
 */
export interface BuildConfig extends DeepPartial<Omit<BuildOptions, "entries">> {
    entries?: (BuildEntry | string)[];
    hooks?: Partial<BuildHooks>;
    preset?: BuildPreset | "auto" | "none" | (NonNullable<unknown> & string);
}

export type InferEntriesResult = {
    entries: BuildEntry[];
    warnings: string[];
};

export type Mode = "build" | "jit" | "watch" | "tsdoc";

export type IsolatedDeclarationsTransformer = (code: string, id: string, sourceMap?: boolean) => Promise<IsolatedDeclarationsResult>;

export interface IsolatedDeclarationsResult {
    errors: string[];
    sourceText: string;
    map?: string;
}

// eslint-disable-next-line import/no-unused-modules
export type { PostCSSMeta } from "./rollup/plugins/css/loaders/types";
// eslint-disable-next-line import/no-unused-modules
export type { InjectOptions, StyleOptions } from "./rollup/plugins/css/types";
