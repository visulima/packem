import type { RollupLogger } from "@visulima/packem-share/utils";
import type PQueue from "p-queue";
import PQueueClass from "p-queue";

import type { InternalStyleOptions, StyleOptions } from "../types";
import type { Loader, LoaderContext, Payload } from "./types";
import matchFile from "./utils/match-file";

/** Default number of threads in the UV thread pool */
const DEFAULT_THREAD_POOL_SIZE = 4;

// This queue makes sure one thread is always available,
// which is necessary for some cases
// ex.: https://github.com/sass/node-sass/issues/857

/**
 * Thread pool size for concurrent loader processing.
 * Uses UV_THREADPOOL_SIZE environment variable if set, otherwise defaults to 4.
 * Leaves one thread available to prevent blocking in certain scenarios.
 */
const threadPoolSize = process.env.UV_THREADPOOL_SIZE ? Number.parseInt(process.env.UV_THREADPOOL_SIZE, 10) : DEFAULT_THREAD_POOL_SIZE; // default `libuv` threadpool size

/**
 * Configuration options for the LoaderManager.
 */
interface LoadersOptions {
    /** @see {@link InternalStyleOptions.extensions} */
    extensions: string[];

    /** Array of loaders to manage */
    loaders: Loader[];

    /** Logger instance for debugging and error reporting */
    logger: RollupLogger;

    /** Internal style processing options */
    options: InternalStyleOptions;
}

/**
 * Manages and orchestrates multiple CSS loaders in a processing pipeline.
 *
 * The LoaderManager handles:
 * - Registration and management of multiple loaders
 * - File type detection and loader matching
 * - Concurrent processing using a thread pool
 * - Error handling and logging
 * - Context management for each loader
 * @example
 * ```typescript
 * const manager = new LoaderManager({
 *   extensions: ['.css', '.scss'],
 *   loaders: [sassLoader, postcssLoader],
 *   logger: rollupLogger,
 *   options: styleOptions
 * });
 *
 * const result = await manager.process(payload, context);
 * ```
 */
class LoaderManager {
    /** Function to test if a file should be processed based on extensions */
    private readonly test: (file: string) => boolean;

    /** Map of registered loaders by name */
    private readonly loaders = new Map<string, Loader>();

    /** Internal style processing options */
    private readonly options: InternalStyleOptions;

    /** Queue for managing concurrent loader processing */
    private workQueue?: PQueue;

    /** Logger instance for debugging and error reporting */
    private readonly logger: RollupLogger;

    /**
     * Creates a new LoaderManager instance.
     * @param options Configuration options for the loader manager
     */
    public constructor({ extensions, loaders, logger, options }: LoadersOptions) {
        this.test = (file: string): boolean => extensions.some((extension) => file.toLowerCase().endsWith(extension));

        if (loaders.length > 0) {
            this.add(...loaders);
        }

        this.options = options;
        this.logger = logger;
    }

    /**
     * Adds one or more loaders to the manager.
     * @param loaders Loaders to add to the manager
     * @template T - Type of loader options
     */
    public add<T extends Record<string, unknown>>(...loaders: Loader<T>[]): void {
        for (const loader of loaders) {
            if (this.loaders.has(loader.name)) {
                continue;
            }

            this.loaders.set(loader.name, loader as Loader);
        }
    }

    /**
     * Checks if a file is supported by any registered loader.
     * @param file File path to check
     * @returns True if the file is supported by at least one loader
     */
    public isSupported(file: string): boolean {
        if (this.test(file)) {
            return true;
        }

        for (const [, loader] of this.loaders) {
            if (matchFile(file, loader.test)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Processes a payload through all applicable loaders in sequence.
     *
     * Each loader is executed if it either:
     * - Has `alwaysProcess` set to true, or
     * - Has a test that matches the file being processed
     * @param payload The payload to process
     * @param context The loader context
     * @returns The processed payload after all applicable loaders have run
     */
    public async process(payload: Payload, context: LoaderContext): Promise<Payload> {
        if (!this.workQueue) {
            this.workQueue = new PQueueClass({ concurrency: threadPoolSize - 1 });
        }

        for await (const [name, loader] of this.loaders) {
            const loaderContext: LoaderContext = {
                ...context,

                options: (this.options[name as keyof StyleOptions] as Record<string, unknown>) ?? {},
            };

            if (loader.alwaysProcess || matchFile(loaderContext.id, loader.test)) {
                this.logger.debug({ message: `Processing ${name} loader for ${loaderContext.id}`, plugin: "css" });

                try {
                    const process = await this.workQueue.add(loader.process.bind(loaderContext, payload));

                    if (process) {
                        // eslint-disable-next-line no-param-reassign
                        payload = process;

                        this.logger.debug({
                            message: `Completed ${name} loader for ${loaderContext.id}`,
                            outputSize: process.code?.length || 0,
                            plugin: "css",
                        });
                    }
                } catch (error) {
                    this.logger.error({
                        file: loaderContext.id,
                        loader: name,
                        message: `Error in ${name} loader for ${loaderContext.id}: ${error instanceof Error ? error.message : String(error)}`,
                        plugin: "css",
                    });
                    throw error;
                }
            }
        }

        return payload;
    }
}

export default LoaderManager;
