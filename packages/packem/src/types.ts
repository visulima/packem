import type {
    IsolatedDeclarationsTransformer,
    PackemRollupOptions,
    TransformerFn,
    TransformerName,
} from "@visulima/packem-rollup";
import type { InternalOXCTransformPluginConfig } from "@visulima/packem-rollup/oxc";
import type { BuildContext, BuildHooks, Environment, Format, Mode, Runtime } from "@visulima/packem-share/types";
import type { FileCache } from "@visulima/packem-share/utils";
import type { StyleOptions } from "@visulima/rollup-css-plugin";
import type { JitiOptions } from "jiti";
import type { Plugin } from "rollup";
import type { TypeDocOptions as BaseTypeDocumentOptions } from "typedoc";

import type { Node10CompatibilityOptions } from "./packem/node10-compatibility";
import type { ResolveExternalsPluginOptions } from "./rollup/plugins/resolve-externals-plugin";

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

/**
 * In addition to basic `entries`, `presets`, and `hooks`,
 * there are also all the properties of `BuildOptions` except for BuildOption's `entries`.
 */
export interface BuildConfig extends DeepPartial<Omit<BuildOptions, "entries">> {
    entries?: (BuildEntry | string)[];
    hooks?: Partial<BuildHooks<BuildOptions>>;
    preset?: BuildPreset | "auto" | "none" | (NonNullable<unknown> & string);
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

export type InferEntriesResult = {
    entries: BuildEntry[];
    warnings: string[];
};

export interface BuildOptions {
    alias: Record<string, string>;
    analyze?: boolean;
    browserTargets?: string[];
    builder?: Record<string, (context: BuildContext<BuildOptions>, cachePath: string | undefined, fileCache: FileCache, logged: boolean) => Promise<void>>;
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
    node10Compatibility?: Node10CompatibilityOptions | false;
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
export interface InternalBuildOptions extends BuildOptions {
    rollup: Omit<BuildOptions["rollup"], "oxc"> & { oxc?: InternalOXCTransformPluginConfig };
    transformerName: TransformerName | undefined;
}

export type KillSignal = "SIGKILL" | "SIGTERM";

export interface RollupBuildOptions extends PackemRollupOptions {
    css?: StyleOptions | false;
    // TODO: Move this out of the `RollupBuildOptions` type
    // @deprecated Use `node10Compatibility` in the main config instead
    node10Compatibility?: Node10CompatibilityOptions | false;
    resolveExternals?: ResolveExternalsPluginOptions;
}

export type RollupPlugins = {
    enforce?: "post" | "pre";
    plugin: Plugin;
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

        /**
         * Additional custom conditions to consider valid in exports field validation.
         * These will be added to the standard and community conditions.
         * @example ["custom", "my-bundler"]
         */
        extraConditions?: string[];
        files?: boolean;
        main?: boolean;
        module?: boolean;
        name?: boolean;
        types?: boolean;
        typesVersions?: boolean;
    };
};

export type { Environment, Format, Mode, Runtime } from "@visulima/packem-share/types";
export type { InjectOptions, PostCSSMeta, StyleOptions } from "@visulima/rollup-css-plugin";
