import type { ConstructorOptions } from "@visulima/pail";
import { createPail } from "@visulima/pail";
import { SimpleReporter } from "@visulima/pail/reporter/simple";

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
 * Runs the Packem bundler with the specified options.
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

    const pailOptions: ConstructorOptions<string, string> = {
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
    };

    // `createPail` expects `ServerConstructorOptions`, which `@visulima/pail` does
    // not re-export from its package root (only `ConstructorOptions` is public).
    // The two types are structurally compatible for the options we pass; the cast
    // bridges the gap without naming an unexported type or using `any`.
    const pail = createPail(pailOptions as unknown as Parameters<typeof createPail>[0]);

    await internalPackem(rootDirectory, mode, environment, pail, debug, inputConfig, tsconfigPath);
};

export type { BuildEntry, BuildOptions, RollupBuildOptions } from "./types";
export type { TransformerFn, TransformerName } from "@visulima/packem-plugins";
export type {
    BuildContext,
    BuildContextBuildAssetAndChunk,
    BuildContextBuildEntry,
    BuildHooks,
    Environment,
    Mode,
    Runtime,
} from "@visulima/packem-share/types";
