import type { CheckPackageOptions } from "@arethetypeswrong/core";
import type { IsolatedDeclarationsTransformer, PackemRollupOptions, TransformerFn, TransformerName } from "@visulima/packem-rollup";
import type { InternalOXCTransformPluginConfig } from "@visulima/packem-rollup/oxc";
import type { NativeModulesOptions } from "@visulima/packem-rollup/plugin/native-modules";
import type { BuildContext, BuildHooks, Environment, Format, Mode, Runtime } from "@visulima/packem-share/types";
import type { FileCache } from "@visulima/packem-share/utils";
import type { StyleOptions } from "@visulima/rollup-plugin-css";
import type { JitiOptions } from "jiti";
import type { Plugin } from "rollup";
import type { TypeDocOptions as BaseTypeDocumentOptions } from "typedoc";

import type { Node10CompatibilityOptions } from "./packem/node10-compatibility";
import type { ResolveExternalsPluginOptions } from "./rollup/plugins/resolve-externals-plugin";

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

export interface AttwOptions extends CheckPackageOptions {
    /**
     * Ignore the scripts on pack
     * @default false
     */
    ignoreScripts?: boolean;

    /**
     * The level of the check.
     *
     * The available levels are:
     * - `error`: fails the build
     * - `warn`: warns the build
     * @default 'warn'
     */
    level?: "error" | "warn";

    /**
     * Specify the package manager to use for --pack
     * Bun does not support --json option on the pack command, if you choose bun you will get a error.
     * @default 'auto'
     */
    pm?: "pnpm" | "yarn" | "npm" | "bun" | "auto";

    /**
     * Profiles select a set of resolution modes to require/ignore. All are evaluated but failures outside
     * of those required are ignored.
     *
     * The available profiles are:
     * - `strict`: requires all resolutions
     * - `node16`: ignores node10 resolution failures
     * - `esmOnly`: ignores CJS resolution failures
     * @default 'strict'
     */
    profile?: "strict" | "node16" | "esmOnly";
}

/**
 * In addition to basic `entries`, `presets`, and `hooks`,
 * there are also all the properties of `BuildOptions` except for BuildOption's `entries`.
 */
export interface BuildConfig extends DeepPartial<Omit<BuildOptions, "entries">> {
    entries?: (BuildEntry | string)[];
    hooks?: Partial<BuildHooks<InternalBuildOptions>>;
    preset?: BuildPreset | "none" | (NonNullable<unknown> & string);
}

export type BuildPreset = BuildConfig | (() => BuildConfig);

/**
 * Function type for dynamic build configuration.
 * Allows configuration to be generated based on environment and mode.
 * @param environment The build environment (development/production)
 * @param mode The build mode (build/watch)
 * @returns Build configuration object or Promise resolving to one
 * @public
 */
export type BuildConfigFunction = (environment: Environment, mode: Mode) => BuildConfig | Promise<BuildConfig>;

export type BuildEntry = {
    /** Whether to generate CommonJS output for this entry */
    cjs?: boolean;
    /** TypeScript declaration file generation mode */
    declaration?: boolean | "compatible" | "node16";
    /** Build environment for this entry */
    environment?: Environment;
    /** Whether to generate ESM output for this entry */
    esm?: boolean;
    /** Whether this entry should be marked as executable */
    executable?: true;
    /** Set of export keys to include for this entry */
    exportKey?: Set<string>;
    /** Alternative filename for the output file */
    fileAlias?: string;
    /** Input file path for this entry */
    input: string;
    /** Whether the input is a glob pattern */
    isGlob?: boolean;
    /** Name identifier for this entry */
    name?: string;
    /** Output directory for this entry */
    outDir?: string;
    /** Runtime environment for this entry */
    runtime?: Runtime;
};

export type InferEntriesResult = {
    /** Inferred build entries */
    entries: BuildEntry[];
    /** Warning messages from the inference process */
    warnings: string[];
};

export interface BuildOptions {
    /** Path alias mappings for module resolution */
    alias: Record<string, string>;
    /** Whether to analyze bundle size and dependencies */
    analyze?: boolean;
    /** Browser targets for transpilation (e.g., ['chrome 58', 'firefox 57']) */
    browserTargets?: string[];
    /** Custom builder functions for different build types */
    builder?: Record<string, (context: BuildContext<BuildOptions>, cachePath: string | undefined, fileCache: FileCache, logged: boolean) => Promise<void>>;
    /** Whether to enable CommonJS interop for ESM modules */
    cjsInterop?: boolean;
    /** Whether to clean the output directory before building */
    clean: boolean;
    /** Whether to enable debug mode with verbose logging */
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
    /** Whether to emit CommonJS output */
    emitCJS?: boolean;
    /** Whether to emit ESM output */
    emitESM?: boolean;
    /** Build entry points */
    entries: BuildEntry[];
    /** Experimental features configuration */
    experimental?: {
        /**
         * If `true`, the `oxc resolve` plugin will be used instead of the default `@rollup/plugin-node-resolve` and `@rollup/plugin-alias`.
         */
        oxcResolve?: boolean;
    };
    /** External dependencies that should not be bundled */
    externals: (RegExp | string)[];
    /** Whether to fail the build on warnings */
    failOnWarn?: boolean;
    /** Whether to enable file caching for faster rebuilds */
    fileCache?: boolean;

    /**
     * Array of export keys to ignore during entry inference.
     * Useful for excluding exports that only contain images or other non-JavaScript assets.
     * @example ["images", "assets", "icons"]
     */
    ignoreExportKeys?: string[];

    /**
     * Isolated declaration transformer for TypeScript declaration generation
     * @experimental
     */
    isolatedDeclarationTransformer?: IsolatedDeclarationsTransformer;

    /**
     * Jiti options, where [jiti](https://github.com/unjs/jiti) is used to load the entry files.
     * @default { alias: {}, debug: false, interopDefault: true }
     */
    jiti: Omit<JitiOptions & { absoluteJitiPath?: boolean }, "onError" | "transform">;
    /** Signal to use when killing child processes */
    killSignal?: KillSignal;
    /** Whether to minify the output */
    minify?: boolean | undefined;
    /** Name of the build */
    name: string;
    /** Node.js 10 compatibility options */
    node10Compatibility?: Node10CompatibilityOptions | false;
    /** Command to run or function to execute after successful build */

    onSuccess?: string | (() => Promise<(() => Promise<void> | void) | undefined | void>);
    /** Timeout for the onSuccess command in milliseconds */
    onSuccessTimeout?: number;
    /** Output directory for build artifacts */
    outDir: string;
    /** Custom file extensions for different output formats */
    outputExtensionMap?: Record<Format, string>;
    /** Rollup-specific build options */
    rollup: RollupBuildOptions;
    /** Root directory of the project */
    rootDir: string;
    /** Target runtime environment */
    runtime?: "browser" | "node";
    /** Source directory containing the source files */
    sourceDir: string;
    /** Whether to generate source maps */
    sourcemap: boolean;
    /** Transformer function for processing source files */
    transformer: TransformerFn;
    /** TypeDoc configuration for generating documentation */
    typedoc: TypeDocumentOptions | false;

    /**
     * If `true`, enables unbundle mode which preserves the source file structure.
     * Instead of bundling everything into a single file, each module is output as a separate file
     * maintaining the original directory structure.
     * @default false
     * @example
     * ```typescript
     * // With unbundle: true
     * // src/index.ts exports from './a/indexA', './b/indexB'
     * // Output: dist/index.js, dist/a/indexA.js, dist/b/indexB.js
     * ```
     */
    unbundle?: boolean;
    /** Validation options for the build */
    validation?: ValidationOptions | false;
}
export interface InternalBuildOptions extends BuildOptions {
    /** Rollup options with internal OXC configuration */
    rollup: BuildOptions["rollup"] & {
        nativeModules?: NativeModulesOptions | false;
        oxc?: InternalOXCTransformPluginConfig;
    };
    /** Name of the transformer being used */
    transformerName: TransformerName | undefined;
}

/** Valid kill signals for terminating child processes */
export type KillSignal = "SIGKILL" | "SIGTERM";

export interface RollupBuildOptions extends PackemRollupOptions {
    /** CSS processing options or false to disable */
    css?: StyleOptions | false;
    /** External dependency resolution plugin options */
    resolveExternals?: ResolveExternalsPluginOptions;
}

export type RollupPlugins = {
    /** Plugin enforcement order ('pre' or 'post') */
    enforce?: "post" | "pre";
    /** The Rollup plugin instance */
    plugin: Plugin;
    /** Type of build this plugin applies to */
    type?: "build" | "dts";
}[];

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
    /**
     * Run `arethetypeswrong` after bundling.
     * Requires `@arethetypeswrong/core` to be installed.
     * @default false
     * @see https://github.com/arethetypeswrong/arethetypeswrong.github.io
     */
    attw?: boolean | AttwOptions;
    /** Bundle size validation options */
    bundleLimit?: {
        /** Allow the build to succeed even if limits are exceeded */
        allowFail?: boolean;

        /**
         * Bundle size limit in bytes, or string with unit (e.g., "1MB", "500KB")
         * @example
         * - "1MB"
         * - "500KB"
         * - 1048576 // 1MB in bytes
         */
        limit?: number | `${number}${"B" | "GB" | "KB" | "MB" | "TB"}`;
        /** Size limits for specific files or globs */
        limits?: Record<string, number | `${number}${"B" | "GB" | "KB" | "MB" | "TB"}`>;
    };
    /** Dependency validation options */
    dependencies:
        | {
            /** Hoisted dependency validation with exclusions */
            hoisted: { exclude: string[] } | false;
            /** Unused dependency validation with exclusions */
            unused: { exclude: string[] } | false;
        }
        | false;
    /** Package.json validation options */
    packageJson?: {
        /** Allowed file extensions in exports field */
        allowedExportExtensions?: string[];
        /** Whether to validate the bin field */
        bin?: boolean;
        /** Whether to validate dependencies */
        dependencies?: boolean;
        /** Whether to validate the engines field */
        engines?: boolean;
        /** Whether to validate the exports field */
        exports?: boolean;

        /**
         * Additional custom conditions to consider valid in exports field validation.
         * These will be added to the standard and community conditions.
         * @example ["custom", "my-bundler"]
         */
        extraConditions?: string[];
        /** Whether to validate the files field */
        files?: boolean;
        /** Whether to validate the main field */
        main?: boolean;
        /** Whether to validate the module field */
        module?: boolean;
        /** Whether to validate the name field */
        name?: boolean;
        /** Whether to validate the sideEffects field */
        sideEffects?: boolean;
        /** Whether to validate the types field */
        types?: boolean;
        /** Whether to validate the typesVersions field */
        typesVersions?: boolean;
    };
};

export type { Environment, Format, Mode, Runtime } from "@visulima/packem-share/types";
export type { InjectOptions, StyleOptions } from "@visulima/rollup-plugin-css";
