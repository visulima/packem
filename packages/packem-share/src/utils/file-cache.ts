import { isAccessibleSync, readFileSync, writeFile } from "@visulima/fs";
import { join, resolve, sep, toNamespacedPath } from "@visulima/path";
import stringify from "safe-stable-stringify";

import type { RollupLogger } from "./create-rollup-logger";

/**
 * Attempts to parse a string as JSON. Returns `{ ok: true, value }` on success
 * so callers can avoid the previous test-then-parse pattern that ran
 * `JSON.parse` twice per cache read.
 */
const tryParseJson = (value: string): { ok: false } | { ok: true; value: unknown } => {
    try {
        return { ok: true, value: JSON.parse(value) };
    } catch {
        return { ok: false };
    }
};

/**
 * Tags a serialized cache payload that `set()` put in the memory cache without
 * parsing it. The parse is deferred to the first `get()` that actually reads the
 * entry in the same process (and memoized there), so a large rollup/dts cache
 * object that is only ever read back by a *later* process is never parsed here.
 * The symbol is module-private, so a tagged holder can never collide with a real
 * cached value.
 */
const LAZY_CACHE_VALUE = Symbol("packem.lazyCacheValue");

interface LazyCacheValue {
    [LAZY_CACHE_VALUE]: string;
}

const lazyCacheValue = (raw: string): LazyCacheValue => {
    return { [LAZY_CACHE_VALUE]: raw };
};

const isLazyCacheValue = (value: unknown): value is LazyCacheValue => typeof value === "object" && value !== null && LAZY_CACHE_VALUE in value;

/**
 * A file-based cache implementation with memory caching for improved performance.
 * Provides methods to store, retrieve, and check the existence of cached data.
 */
class FileCache {
    // The namespaced form of `cwd`, precomputed once. `getFilePath` runs on every
    // has/get/set, and `cwd` never changes, so caching `toNamespacedPath(cwd)` here
    // avoids redoing that call (and its Windows `\\?\` prefixing) per cache access.
    readonly #namespacedCwd: string;

    // The plain `cwd`. The module ids handed to the cache are usually NOT
    // namespaced, so on Windows the `\\?\`-prefixed `#namespacedCwd` would never
    // match; stripping the plain form too keeps cache keys consistent across
    // platforms. On POSIX `toNamespacedPath` is the identity, so both are equal.
    readonly #cwd: string;

    readonly #cachePath: string | undefined;

    readonly #hashKey: string;

    #isEnabled = true;

    // Explicit value type instead of relying on the `ts-reset` augmentation that
    // would let `new Map<string>()` default the value to `unknown`.
    // eslint-disable-next-line @typescript-eslint/consistent-generic-constructors -- the annotation documents the value type without depending on ts-reset
    readonly #memoryCache: Map<string, unknown> = new Map();

    // Memoizes `getFilePath` results keyed by `name + "\0" + subDirectory`. The
    // cache-plugin access pattern is `has(k) ? get(k) : compute()`, which would
    // otherwise run the cwd-stripping/path-join string work twice per probe.
    readonly #filePathCache = new Map<string, string>();

    // In-flight async disk writes from `set()`. The build doesn't await individual
    // writes (it would block on tens of thousands of files on a large cold build);
    // instead `flush()` awaits the whole set once the build has stopped issuing
    // writes, guaranteeing persistence before the process exits.
    readonly #pendingWrites = new Set<Promise<void>>();

    /**
     * Creates a new FileCache instance.
     * @param cwd The current working directory
     * @param cachePath The path to the cache directory, can be undefined
     * @param hashKey A hash key for cache organization
     * @param logger Logger instance for debug messages
     */
    public constructor(cwd: string, cachePath: string | undefined, hashKey: string, logger: RollupLogger) {
        this.#namespacedCwd = toNamespacedPath(cwd);
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
            const cached: unknown = this.#memoryCache.get(filePath);

            // `set()` stores serialized payloads as a LazyCacheValue; parse on first
            // read and replace the entry with the resolved value so subsequent reads
            // are free and the result matches a disk round-trip.
            if (isLazyCacheValue(cached)) {
                const raw = cached[LAZY_CACHE_VALUE];
                const parsed = tryParseJson(raw);
                const value = parsed.ok ? parsed.value : raw;

                this.#memoryCache.set(filePath, value);

                return value as R;
            }

            return cached as R;
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

        let payload: ArrayBuffer | ArrayBufferView | string = data as ArrayBuffer | ArrayBufferView | string;

        if (typeof data === "object" || typeof data === "number" || typeof data === "boolean") {
            // Native JSON.stringify is ~3x faster than safe-stable-stringify on
            // the rollup/dependencies cache payloads, which are JSON-safe by
            // construction. Fall back to stable stringify when the payload
            // contains circular references or BigInt — both rare but possible
            // in arbitrary plugin caches.
            try {
                payload = JSON.stringify(data);
            } catch {
                payload = stringify(data);
            }
        }

        // Populate the memory cache with the value a later `get()` would produce,
        // NOT the original object. The disk path round-trips through JSON
        // (write string → read string → parse), and same-process consumers depend
        // on that: e.g. the JS build sets the dependencies cache and the dts build
        // reads it back in the same run, and the dts resolver's output differs if it
        // sees the original (richer, by-reference) object instead of the normalized
        // copy. Store the serialized payload as a LazyCacheValue so the JSON parse is
        // deferred to (and memoized at) the first same-process read — the large
        // rollup/dts cache objects are only read back by a later process, so they are
        // never parsed here. The disk write below can stay async.
        if (typeof payload === "string") {
            this.#memoryCache.set(filePath, lazyCacheValue(payload));
        } else {
            // Binary payloads aren't JSON round-tripped; same-process re-reads of
            // these are not a real pattern, so store the original buffer as-is.
            this.#memoryCache.set(filePath, data);
        }

        // Write asynchronously and don't await it here: a large cold build issues
        // tens of thousands of writes, and blocking on each `writeFileSync` was a
        // dominant share of build time. `flush()` awaits the queue at build end so
        // the cache still lands on disk for warm rebuilds. A failed cache write must
        // never fail the build, so errors are swallowed.
        const write = writeFile(filePath, payload, { overwrite: true })
            .catch(() => {})
            .finally(() => {
                this.#pendingWrites.delete(write);
            });

        this.#pendingWrites.add(write);
    }

    /**
     * Awaits all in-flight disk writes queued by `set()`. Call once a build has
     * finished issuing cache writes (and before the process may exit) so the
     * on-disk cache is complete for the next, warm build.
     */
    public async flush(): Promise<void> {
        while (this.#pendingWrites.size > 0) {
            // eslint-disable-next-line no-await-in-loop -- drain in waves; new writes may queue while awaiting the current batch.
            await Promise.all(this.#pendingWrites);
        }
    }

    /**
     * Generates the file path for a cache entry.
     * @param name The cache key name
     * @param subDirectory Optional subdirectory within the cache
     * @returns The complete file path for the cache entry
     */
    private getFilePath(name: string, subDirectory?: string): string {
        const memoKey = `${name} ${subDirectory ?? ""}`;
        const memoized = this.#filePathCache.get(memoKey);

        if (memoized !== undefined) {
            return memoized;
        }

        // Strip the `cwd` prefix only when the id is genuinely under it. A
        // substring `replaceAll` would also strip `cwd` appearing mid-path or
        // collide with a sibling dir sharing the prefix (`/a/b` vs `/a/bc/...`),
        // so use an explicit prefix check (`cwd + sep`) then slice.
        let optimizedName = this.#stripCwdPrefix(name, this.#namespacedCwd);

        if (this.#cwd !== this.#namespacedCwd) {
            optimizedName = this.#stripCwdPrefix(optimizedName, this.#cwd);
        }

        optimizedName = optimizedName.replaceAll(":", "-");

        const cacheRoot = this.#cachePath as string;
        const filePath = join(cacheRoot, this.#hashKey, subDirectory?.replaceAll(":", "-") ?? "", toNamespacedPath(optimizedName));

        // Defend against path traversal: a `..` segment in `name`/`subDirectory`
        // could escape the cache directory. Confirm the resolved path stays under
        // the resolved cache root; throw otherwise so a malicious/unexpected key
        // never reads or writes outside the cache.
        const resolvedRoot = resolve(cacheRoot);
        const resolvedPath = resolve(filePath);

        if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
            throw new Error(`FileCache: cache key resolves outside the cache directory: ${name}`);
        }

        this.#filePathCache.set(memoKey, filePath);

        return filePath;
    }

    /**
     * Removes a leading `prefix` from `value` only when `value` is exactly the
     * prefix or sits under it (`prefix + sep`), avoiding the substring collisions
     * a naive `replaceAll` would cause.
     */
    // eslint-disable-next-line class-methods-use-this
    #stripCwdPrefix(value: string, prefix: string): string {
        if (prefix === "") {
            return value;
        }

        if (value === prefix) {
            return "";
        }

        if (value.startsWith(prefix + sep)) {
            return value.slice(prefix.length);
        }

        return value;
    }
}

export default FileCache;
