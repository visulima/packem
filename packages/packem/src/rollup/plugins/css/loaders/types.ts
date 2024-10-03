import type { Pail } from "@visulima/pail";
import type { PluginContext } from "rollup";
import type { RawSourceMap } from "source-map-js";

import type { InternalStyleOptions } from "../types";

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
    /** Assets to emit */
    readonly assets: Map<string, Uint8Array>;
    readonly cwd?: string;
    /** Files to watch */
    readonly deps: Set<string>;
    /** @see {@link InternalStyleOptions.dts} */
    readonly dts: InternalStyleOptions["dts"];
    /** @see {@link InternalStyleOptions.emit} */
    readonly emit: InternalStyleOptions["emit"];
    /** @see {@link InternalStyleOptions.extensions} */
    readonly extensions: InternalStyleOptions["extensions"];
    /** @see {@link InternalStyleOptions.extract} */
    readonly extract: InternalStyleOptions["extract"];
    /** Resource path */
    readonly id: string;
    /** @see {@link InternalStyleOptions.inject} */
    readonly inject: InternalStyleOptions["inject"];
    logger: Pail;
    /** @see {@link InternalStyleOptions.namedExports} */
    readonly namedExports: InternalStyleOptions["namedExports"];
    /**
     * Loader's options
     * @default {}
     */
    readonly options: T;
    /** [Plugin's context](https://rollupjs.org/guide/en#plugin-context) */
    readonly plugin: PluginContext;
    readonly sourceDir?: string;
    /** @see {@link InternalStyleOptions.sourceMap} */
    readonly sourceMap: false | ({ inline: boolean } & SourceMapOptions);
    /** [Function for emitting a warning](https://rollupjs.org/guide/en/#thiswarnwarning-string--rollupwarning-position-number---column-number-line-number---void) */
    readonly warn: PluginContext["warn"];
}

export interface Extracted {
    /** CSS */
    css: string;
    /** Source file path */
    id: string;
    /** Sourcemap */
    map?: string;
}

export interface Payload {
    /** File content */
    code: string;
    dts?: string;
    /** Extracted data */
    extracted?: Extracted;
    /** Sourcemap */
    map?: string;
}

export interface SourceMapOptions {
    /**
     * Include sources content
     * @default true
     */
    content?: boolean;
    /** Function for transforming resulting sourcemap */
    transform?: (map: RawSourceMap, name?: string) => void;
}
