import type { Environment } from "@visulima/packem-share/types";
import type { RollupLogger } from "@visulima/packem-share/utils";
import type { CustomPluginOptions, PluginContext } from "rollup";
import type { RawSourceMap } from "source-map-js";

import type { InternalStyleOptions } from "../types";

export interface Extracted {
    /** CSS */
    css: string;

    /** Source file path */
    id: string;

    /** Sourcemap */
    map?: string;
}

/**
 * @param T type of loader's options
 */
export interface Loader<T = Record<string, unknown>> {
    /** Skip testing, always process the file */
    alwaysProcess?: boolean;

    /** Name */
    name: string;

    /** Function for processing */
    process: (this: LoaderContext<T>, payload: Payload) => Payload | Promise<Payload>;

    /**
     * Test to control if file should be processed.
     * Also used for plugin's supported files test.
     */
    test?: RegExp | ((file: string) => boolean);
}

/**
 * @param T type of loader's options
 */
export interface LoaderContext<T = Record<string, unknown>> {
    readonly alias?: Record<string, string>;

    /** Assets to emit */
    readonly assets: Map<string, Uint8Array>;

    /** @see {@link InternalStyleOptions.autoModules} */
    readonly autoModules: InternalStyleOptions["autoModules"];

    /** Browser targets */
    readonly browserTargets: string[];
    readonly cwd?: string;
    readonly debug?: boolean;

    /** Files to watch */
    readonly deps: Set<string>;

    /** @see {@link InternalStyleOptions.dts} */
    readonly dts: InternalStyleOptions["dts"];

    /** @see {@link InternalStyleOptions.emit} */
    readonly emit: InternalStyleOptions["emit"];
    readonly environment: Environment;

    /** @see {@link InternalStyleOptions.extensions} */
    readonly extensions: InternalStyleOptions["extensions"];

    /** @see {@link InternalStyleOptions.extract} */
    readonly extract: InternalStyleOptions["extract"];

    /** Resource path */
    readonly id: string;

    /** @see {@link InternalStyleOptions.inject} */
    readonly inject: InternalStyleOptions["inject"];

    /** @see {@link InternalStyleOptions.inline} */
    readonly inline: InternalStyleOptions["inline"];

    /** Rollup-compatible logger for plugin messages */
    readonly logger: RollupLogger;

    /** @see {@link InternalStyleOptions.namedExports} */
    readonly namedExports: InternalStyleOptions["namedExports"];

    /**
     * Type-safe configuration options passed to the loader instance
     * @default {}
     */
    readonly options: T;

    /** [Plugin's context](https://rollupjs.org/guide/en#plugin-context) */
    readonly plugin: PluginContext;
    readonly sourceDir?: string;

    /** @see {@link InternalStyleOptions.sourceMap} */
    readonly sourceMap: false | (SourceMapOptions & { inline: boolean });
    readonly useSourcemap: boolean;
}

export interface Payload {
    /** File content */
    code: string;
    dts?: string;

    /** Extracted data */
    extracted?: Extracted;

    /** Sourcemap */
    map?: string;

    /** Additional metadata exposed to other Rollup plugins */
    meta?: CustomPluginOptions;
}

export type PostCSSMeta = {
    icssDependencies: string[];
    moduleContents: string;
    types: string;
};

export interface SourceMapOptions {
    /**
     * Include sources content
     * @default true
     */
    content?: boolean;

    /** Function for transforming resulting sourcemap */
    transform?: (map: RawSourceMap, name?: string) => void;
}
