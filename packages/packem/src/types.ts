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
import type { PureAnnotationsOptions } from "rollup-plugin-pure";
import type { PluginVisualizerOptions } from "rollup-plugin-visualizer";
import type { TypeDocOptions as BaseTypeDocumentOptions } from "typedoc";

import type { Node10CompatibilityOptions } from "./packem/node10-compatibility";
import type { CJSInteropOptions } from "./rollup/plugins/cjs-interop";
import type { CopyPluginOptions } from "./rollup/plugins/copy";
import type { StyleOptions } from "./rollup/plugins/css/types";
import type { EsbuildPluginConfig, Options as EsbuildOptions } from "./rollup/plugins/esbuild/types";
import type { EsmShimCjsSyntaxOptions } from "./rollup/plugins/esm-shim-cjs-syntax";
import type { IsolatedDeclarationsOptions } from "./rollup/plugins/isolated-declarations";
import type { JSXRemoveAttributesPlugin } from "./rollup/plugins/jsx-remove-attributes";
import type { LicenseOptions } from "./rollup/plugins/license";
import type { OxcResolveOptions } from "./rollup/plugins/oxc/oxc-resolve";
import type { InternalOXCTransformPluginConfig, OXCTransformPluginConfig } from "./rollup/plugins/oxc/types";
import type { RawLoaderOptions } from "./rollup/plugins/raw";
import type { ResolveExternalsPluginOptions } from "./rollup/plugins/resolve-externals-plugin";
import type { ShebangOptions } from "./rollup/plugins/shebang";
import type { SourcemapsPluginOptions } from "./rollup/plugins/source-maps";
import type { SucrasePluginConfig } from "./rollup/plugins/sucrase/types";
import type { SwcPluginConfig } from "./rollup/plugins/swc/types";
import type { PatchTypesOptions } from "./rollup/plugins/typescript/patch-typescript-types";
import type { TsconfigPathsPluginOptions } from "./rollup/plugins/typescript/resolve-tsconfig-paths-plugin";
import type { UrlOptions } from "./rollup/plugins/url";
import type FileCache from "./utils/file-cache";

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

export type Format = "cjs" | "esm";

export type Environment = "production" | "development" | undefined;

/**
 * In addition to basic `entries`, `presets`, and `hooks`,
 * there are also all the properties of `BuildOptions` except for BuildOption's `entries`.
 */
export interface BuildConfig extends DeepPartial<Omit<BuildOptions, "entries">> {
    entries?: (BuildEntry | string)[];
    hooks?: Partial<BuildHooks>;
    preset?: BuildPreset | "auto" | "none" | (NonNullable<unknown> & string);
}

/**
 * Function type for dynamic build configuration.
 * Allows configuration to be generated based on environment and mode.
 * @param environment The build environment (development/production)
 * @param mode The build mode (build/watch)
 * @returns Build configuration object or Promise resolving to one
 * @public
 */
export type BuildConfigFunction = (environment: Environment, mode: Mode) => BuildConfig | Promise<BuildConfig>;

export interface BuildContext {
    buildEntries: (BuildContextBuildAssetAndChunk | BuildContextBuildEntry)[];
    dependencyGraphMap: Map<string, Set<[string, string]>>;
    environment: Environment;
    hoistedDependencies: Set<string>;
    hooks: Hookable<BuildHooks>;
    implicitDependencies: Set<string>;
    jiti: Jiti;
    logger: Pail;
    mode: Mode;
    options: InternalBuildOptions;
    pkg: PackageJson;
    tsconfig?: TsConfigResult;
    usedDependencies: Set<string>;
    warnings: Set<string>;
}

export type BuildContextBuildAssetAndChunk = {
    chunk?: boolean;
    chunks?: string[];
    dynamicImports?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    size?: {
        brotli?: number;
        bytes?: number;
        gzip?: number;
    };
    type?: "asset" | "chunk";
};

export type BuildContextBuildEntry = {
    chunk?: boolean;
    chunks?: string[];
    dynamicImports?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    size?: {
        brotli?: number;
        bytes?: number;
        gzip?: number;
    };
    type?: "entry";
};

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

export interface BuildOptions {
    alias: Record<string, string>;
    analyze?: boolean;
    browserTargets?: string[];
    builder?: Record<string, (context: BuildContext, cachePath: string | undefined, fileCache: FileCache, logged: boolean) => Promise<void>>;
    cjsInterop?: boolean;
    clean: boolean;
    debug: boolean;

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
    experimental?: {
        /**
         * If `true`, the `oxc resolve` plugin will be used instead of the default `@rollup/plugin-node-resolve` and `@rollup/plugin-alias`.
         */
        oxcResolve?: boolean;
    };
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
    onSuccess?: string | (() => Promise<(() => Promise<void> | void) | undefined | void>);
    onSuccessTimeout?: number;
    outDir: string;
    outputExtensionMap?: Record<Format, string>;
    rollup: RollupBuildOptions;
    rootDir: string;
    runtime?: "browser" | "node";
    sourceDir: string;
    sourcemap: boolean;
    transformer: TransformerFn;
    typedoc: TypeDocumentOptions | false;
    validation?: ValidationOptions | false;
}

export type BuildPreset = BuildConfig | (() => BuildConfig);

export type InferEntriesResult = {
    entries: BuildEntry[];
    warnings: string[];
};

export interface InternalBuildOptions extends BuildOptions {
    rollup: Omit<BuildOptions["rollup"], "oxc"> & { oxc?: InternalOXCTransformPluginConfig | false };
    transformerName: TransformerName | undefined;
}

export interface IsolatedDeclarationsResult {
    errors: string[];
    map?: string;
    sourceText: string;
}

export type IsolatedDeclarationsTransformer = (code: string, id: string, sourceMap?: boolean) => Promise<IsolatedDeclarationsResult>;

export type KillSignal = "SIGKILL" | "SIGTERM";

export type Mode = "build" | "jit" | "watch";

export interface RollupBuildOptions {
    alias: RollupAliasOptions | false;
    cjsInterop?: CJSInteropOptions;
    commonjs: RollupCommonJSOptions | false;
    copy?: CopyPluginOptions | false;
    css?: StyleOptions | false;
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
    // TODO: Move this out of the `RollupBuildOptions` type
    node10Compatibility?: Node10CompatibilityOptions | false;
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
    replace: RollupReplaceOptions | false;
    resolve: RollupNodeResolveOptions | false;
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

export type Runtime = "browser" | "edge-light" | "node" | "react-native" | "react-server";

export type TransformerFn = ((config: EsbuildPluginConfig | InternalOXCTransformPluginConfig | SucrasePluginConfig | SwcPluginConfig) => Plugin) & {
    NAME?: TransformerName;
};

export type TransformerName = "esbuild" | "oxc" | "sucrase" | "swc";

export type TypeDocumentOptions = Partial<Omit<BaseTypeDocumentOptions, "entryPoints" | "hideGenerator" | "out" | "preserveWatchOutput" | "watch">> & {
    /**
     * The format of the output.
     * @default "html"
     */
    format?: "html" | "inline" | "json" | "markdown";

    /**
     * The name of the JSON file.
     */
    jsonFileName?: string;

    /**
     * A marker to replace the content within the file on the correct location.
     * @default "TYPEDOC" This marker need to be placed in the readme &lt;!-- TYPEDOC -->&lt;!-- TYPEDOC -->
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
};

export type ValidationOptions = {
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
        limit?: number | `${number}${"B" | "GB" | "KB" | "MB" | "TB"}`;
        // Size limits for specific files or globs
        limits?: Record<string, number | `${number}${"B" | "GB" | "KB" | "MB" | "TB"}`>;
    };
    dependencies: {
        hoisted: { exclude: string[] } | false;
        unused: { exclude: string[] } | false;
    } | false;
    packageJson?: {
        bin?: boolean;
        dependencies?: boolean;
        engines?: boolean;
        exports?: boolean;
        files?: boolean;
        main?: boolean;
        module?: boolean;
        name?: boolean;
        types?: boolean;
        typesVersions?: boolean;
    };
};

export type { PostCSSMeta } from "./rollup/plugins/css/loaders/types";
export type { InjectOptions, StyleOptions } from "./rollup/plugins/css/types";
