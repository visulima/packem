import type { ConstructorOptions } from "@visulima/pail";
import { createPail } from "@visulima/pail";
import { SimpleReporter } from "@visulima/pail/reporter";

import internalPackem from "./packem";
import type { BuildConfig, Environment, Mode } from "./types";

/**
 * Configuration options for Packem bundler.
 * @interface PackemOptions
 * @augments {BuildConfig}
 */
export interface PackemOptions extends BuildConfig {
    /**
     * The environment to build for
     * Determines the build environment configuration
     * @default "production"
     * @type {Environment}
     * @memberof PackemOptions
     */
    environment?: Environment;

    /**
     * Logger configuration options
     * Used to customize the logging behavior and output format
     * @type {ConstructorOptions<string, string>}
     * @memberof PackemOptions
     */
    logger?: ConstructorOptions<string, string>;

    /**
     * The mode to run Packem in
     * Controls how the bundler processes and optimizes the code
     * @default "build"
     * @type {Mode}
     * @memberof PackemOptions
     */
    mode?: Mode;
}

/**
 * Runs the Packem bundler with the specified options
 * @param rootDirectory The root directory of the project to bundle
 * @param options Configuration options for the bundler
 * @returns Promise that resolves with the build result
 * @example
 * ```typescript
 * const result = await packem("./src", {
 *   mode: "build",
 *   environment: "production"
 * });
 * ```
 */
export const packem = async (rootDirectory: string, options: PackemOptions = {}): Promise<void> => {
    const { debug, environment, logger, mode, tsconfigPath, ...inputConfig } = {
        debug: false,
        environment: "production" as Environment,
        logger: {},
        mode: "build" as Mode,
        tsconfigPath: undefined,
        ...options,
    };

    const pail = createPail({
        reporters: [
            new SimpleReporter({
                error: {
                    hideErrorCauseCodeView: true,
                    hideErrorCodeView: true,
                    hideErrorErrorsCodeView: true,
                },
            }),
        ],
        scope: "packem",
        ...logger,
    });

    await internalPackem(rootDirectory, mode, environment, pail, debug, inputConfig as BuildConfig, tsconfigPath);
};

export type {
    BuildEntry,
    BuildOptions,
    RollupBuildOptions,
} from "./types";
export type {
    IsolatedDeclarationsTransformer,
    TransformerFn,
    TransformerName,
} from "@visulima/packem-rollup";
export type {
    BuildContext,
    BuildContextBuildAssetAndChunk,
    BuildContextBuildEntry,
    BuildHooks,
    Environment,
    Mode,
    Runtime,
} from "@visulima/packem-share/types";
