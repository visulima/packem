import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { join, toNamespacedPath } from "@visulima/path";

import type { RollupLogger } from "./create-rollup-logger";

/**
 * Checks if a string is valid JSON.
 * @param value The string to validate
 * @returns True if the string is valid JSON, false otherwise
 */
const isJson = (value: string): boolean => {
    try {
        JSON.parse(value);
    } catch {
        return false;
    }

    return true;
};

/**
 * A file-based cache implementation with memory caching for improved performance.
 * Provides methods to store, retrieve, and check the existence of cached data.
 */
class FileCache {
    readonly #cwd: string;

    readonly #cachePath: string | undefined;

    readonly #hashKey: string;

    #isEnabled = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly #memoryCache = new Map<string, any>();

    /**
     * Creates a new FileCache instance.
     * @param cwd The current working directory
     * @param cachePath The path to the cache directory, can be undefined
     * @param hashKey A hash key for cache organization
     * @param logger Logger instance for debug messages
     */
    public constructor(cwd: string, cachePath: string | undefined, hashKey: string, logger: RollupLogger) {
        this.#cwd = cwd;
        this.#hashKey = hashKey;

        if (cachePath === undefined) {
            logger.debug({
                message: "Could not create cache directory.",
            });
        } else {
            this.#cachePath = cachePath;

            logger.debug({
                message: `Cache path is: ${this.#cachePath}`,
            });
        }
    }

    /**
     * Sets whether the cache is enabled.
     * @param value True to enable cache, false to disable
     */
    public set isEnabled(value: boolean) {
        this.#isEnabled = value;
    }

    /**
     * Gets whether the cache is currently enabled.
     * @returns True if cache is enabled, false otherwise
     */
    public get isEnabled(): boolean {
        return this.#isEnabled;
    }

    /**
     * Checks if a cached file exists.
     * @param name The cache key name
     * @param subDirectory Optional subdirectory within the cache
     * @returns True if the cached file exists, false otherwise
     */
    public has(name: string, subDirectory?: string): boolean {
        if (!this.#isEnabled) {
            return false;
        }

        if (this.#cachePath === undefined) {
            return false;
        }

        return isAccessibleSync(this.getFilePath(name, subDirectory));
    }

    /**
     * Retrieves cached data.
     * @param name The cache key name
     * @param subDirectory Optional subdirectory within the cache
     * @returns The cached data or undefined if not found
     */
    public get<R>(name: string, subDirectory?: string): R | undefined {
        if (!this.#isEnabled) {
            return undefined;
        }

        if (this.#cachePath === undefined) {
            return undefined;
        }

        const filePath = this.getFilePath(name, subDirectory);

        if (this.#memoryCache.has(filePath)) {
            return this.#memoryCache.get(filePath) as R;
        }

        if (!isAccessibleSync(filePath)) {
            return undefined;
        }

        const fileData = readFileSync(filePath) as unknown as string;

        if (isJson(fileData)) {
            const value = JSON.parse(fileData);

            this.#memoryCache.set(filePath, value);

            return value as unknown as R;
        }

        this.#memoryCache.set(filePath, fileData);

        return fileData as unknown as R;
    }

    /**
     * Stores data in the cache.
     * @param name The cache key name
     * @param data The data to cache
     * @param subDirectory Optional subdirectory within the cache
     */
    public set(name: string, data: ArrayBuffer | ArrayBufferView | boolean | number | object | string | null | undefined, subDirectory?: string): void {
        if (!this.#isEnabled) {
            return;
        }

        if (this.#cachePath === undefined || data === undefined) {
            return;
        }

        const filePath = this.getFilePath(name, subDirectory);

        if (typeof data === "object" || typeof data === "number" || typeof data === "boolean") {
            // eslint-disable-next-line no-param-reassign
            data = JSON.stringify(data);
        }

        writeFileSync(filePath, data, {
            overwrite: true,
        });
    }

    /**
     * Generates the file path for a cache entry.
     * @param name The cache key name
     * @param subDirectory Optional subdirectory within the cache
     * @returns The complete file path for the cache entry
     */
    private getFilePath(name: string, subDirectory?: string): string {
        let optimizedName = name.replaceAll(toNamespacedPath(this.#cwd), "");

        optimizedName = optimizedName.replaceAll(":", "-");

        return join(this.#cachePath as string, this.#hashKey, subDirectory?.replaceAll(":", "-") ?? "", toNamespacedPath(optimizedName));
    }
}

export default FileCache;
