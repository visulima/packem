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

import type { CJSInteropOptions } from "./rollup/plugins/cjs-interop";
import type { CopyPluginOptions } from "./rollup/plugins/copy";
import type { EsbuildPluginConfig, Options as EsbuildOptions } from "./rollup/plugins/esbuild/types";
import type { EsmShimCjsSyntaxOptions } from "./rollup/plugins/esm-shim-cjs-syntax";
import type { IsolatedDeclarationsOptions } from "./rollup/plugins/isolated-declarations";
import type { JSXRemoveAttributesPlugin } from "./rollup/plugins/jsx-remove-attributes";
import type { LicenseOptions } from "./rollup/plugins/license";
import type { Node10CompatibilityOptions } from "./rollup/plugins/node10-compatibility-plugin";
import type { RawLoaderOptions } from "./rollup/plugins/raw";
import type { ShebangOptions } from "./rollup/plugins/shebang";
import type { SucrasePluginConfig } from "./rollup/plugins/sucrase/types";
import type { SwcPluginConfig } from "./rollup/plugins/swc/types";
import type { PatchTypesOptions } from "./rollup/plugins/typescript/patch-typescript-types";

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

export type Environment = "production" | "development" | undefined;

export interface RollupBuildOptions {
    alias: RollupAliasOptions | false;
    cjsInterop?: CJSInteropOptions;
    commonjs: RollupCommonJSOptions | false;
    copy?: CopyPluginOptions | false;
    dts: RollupDtsOptions;
    dynamicVars?: RollupDynamicImportVariablesOptions | false;
    esbuild: EsbuildOptions | false;
    isolatedDeclarations?: IsolatedDeclarationsOptions;
    json: RollupJsonOptions | false;
    jsxRemoveAttributes?: JSXRemoveAttributesPlugin | false;
    license?: LicenseOptions | false;
    metafile?: boolean;
    node10Compatibility?: Node10CompatibilityOptions | false;
    output?: OutputOptions;
    patchTypes: PatchTypesOptions | false;
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
    shebang?: Partial<ShebangOptions> | false;
    shim?: EsmShimCjsSyntaxOptions | false;
    sucrase?: SucrasePluginConfig | false;
    swc?: SwcPluginConfig | false;
    treeshake?: RollupOptions["treeshake"];
    visualizer?: PluginVisualizerOptions | false;
    wasm?: RollupWasmOptions | false;
    watch?: RollupOptions["watch"];
}

export type Runtime = "react-server" | "react-native" | "edge-light" | "node";

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

export interface BuildOptions {
    alias: Record<string, string>;
    analyze?: boolean;
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
    externals: (RegExp | string)[];
    failOnWarn?: boolean;
    fileCache?: boolean;
    isolatedDeclarationTransformer?: (code: string, id: string) => Promise<IsolatedDeclarationsResult>;
    minify?: boolean | undefined;
    name: string;
    outDir: string;
    replace: Record<string, string>;
    rollup: RollupBuildOptions;
    rootDir: string;
    sourceDir: string;
    /** @experimental */
    sourcemap: boolean;
    stub: boolean;
    /**
     * Stub options, where [jiti](https://github.com/unjs/jiti)
     * is an object of type `Omit<JitiOptions, "transform" | "onError">`.
     */
    stubOptions: { jiti: Omit<JitiOptions, "onError" | "transform"> };
    transformer?: (config: SwcPluginConfig | SucrasePluginConfig | EsbuildPluginConfig) => Plugin;
    validation?: {
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
    };
}

export interface BuildHooks {
    "build:before": (context: BuildContext) => Promise<void> | void;
    "build:done": (context: BuildContext) => Promise<void> | void;
    "build:prepare": (context: BuildContext) => Promise<void> | void;

    "rollup:build": (context: BuildContext, build: RollupBuild) => Promise<void> | void;
    "rollup:done": (context: BuildContext) => Promise<void> | void;

    "rollup:dts:build": (context: BuildContext, build: RollupBuild) => Promise<void> | void;
    "rollup:dts:done": (context: BuildContext) => Promise<void> | void;
    "rollup:dts:options": (context: BuildContext, options: RollupOptions) => Promise<void> | void;

    "rollup:options": (context: BuildContext, options: RollupOptions) => Promise<void> | void;
    "rollup:watch": (context: BuildContext, watcher: RollupWatcher) => Promise<void> | void;

    "validate:before": (context: BuildContext) => Promise<void> | void;
    "validate:done": (context: BuildContext) => Promise<void> | void;
}

export type BuildContextBuildEntry = {
    bytes?: number;
    chunk?: boolean;
    chunks?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    type?: "entry";
};

export type BuildContextBuildAssetAndChunk = {
    bytes?: number;
    chunk?: boolean;
    chunks?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    type?: "asset" | "chunk";
};

export interface InternalBuildOptions extends BuildOptions {
    transformerName: "esbuild" | "sucrase" | "swc" | undefined;
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

export type Mode = "build" | "jit" | "watch";

export interface IsolatedDeclarationsResult {
    errors: string[];
    sourceText: string;
}
