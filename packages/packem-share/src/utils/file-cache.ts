import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { join, toNamespacedPath } from "@visulima/path";
import stringify from "safe-stable-stringify";

import type { RollupLogger } from "./create-rollup-logger";

/**
 * Attempts to parse a string as JSON. Returns `{ ok: true, value }` on success
 * so callers can avoid the previous test-then-parse pattern that ran
 * `JSON.parse` twice per cache read.
 */
const tryParseJson = (value: string): { ok: false } | { ok: true; value: unknown } => {
    try {
        return { ok: true, value: JSON.parse(value) as unknown };
    } catch {
        return { ok: false };
    }
};

/**
 * A file-based cache implementation with memory caching for improved performance.
 * Provides methods to store, retrieve, and check the existence of cached data.
 */
class FileCache {
    // The namespaced form of `cwd`, precomputed once. `getFilePath` runs on every
    // has/get/set, and `cwd` never changes, so caching `toNamespacedPath(cwd)` here
    // avoids redoing that call (and its Windows `\\?\` prefixing) per cache access.
    readonly #namespacedCwd: string;

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
        this.#namespacedCwd = toNamespacedPath(cwd);
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

        const filePath = this.getFilePath(name, subDirectory);

        // The memory cache is populated by `get()` after the first hit, so once
        // we've read a file we can skip the disk stat entirely. cache-plugin's
        // pattern is `has(k) ? get(k) : compute()`, so warming the path through
        // `has` shaves a syscall per cache hit after the first one.
        if (this.#memoryCache.has(filePath)) {
            return true;
        }

        return isAccessibleSync(filePath);
    }

    /**
     * Retrieves cached data.
     * @param name The cache key name
     * @param subDirectory Optional subdirectory within the cache
     * @returns The cached data or undefined if not found
     */
    // The generic R lets callers type the cached value at the call site without an extra cast.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
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

        const fileData = readFileSync(filePath);

        const parsed = tryParseJson(fileData);

        if (parsed.ok) {
            this.#memoryCache.set(filePath, parsed.value);

            return parsed.value as R;
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
            // Native JSON.stringify is ~3x faster than safe-stable-stringify on
            // the rollup/dependencies cache payloads, which are JSON-safe by
            // construction. Fall back to stable stringify when the payload
            // contains circular references or BigInt — both rare but possible
            // in arbitrary plugin caches.
            // eslint-disable-next-line no-param-reassign
            try {
                data = JSON.stringify(data);
            } catch {
                // eslint-disable-next-line no-param-reassign
                data = stringify(data) as string;
            }
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
        let optimizedName = name.replaceAll(this.#namespacedCwd, "");

        optimizedName = optimizedName.replaceAll(":", "-");

        return join(this.#cachePath as string, this.#hashKey, subDirectory?.replaceAll(":", "-") ?? "", toNamespacedPath(optimizedName));
    }
}

export default FileCache;
