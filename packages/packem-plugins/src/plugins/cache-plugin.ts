/* eslint-disable @typescript-eslint/no-explicit-any -- generic plugin wrapper bridges Rollup's wide hook signatures (any-typed) with `unknown` cache values; matching Rollup's internal AnyFunction shape is required for ObjectHook compatibility. */
import { isAccessibleSync, readFileSync } from "@visulima/fs";
import type { FileCache } from "@visulima/packem-share/utils";
import { join } from "@visulima/path";
import type { ObjectHook, Plugin } from "rollup";

import { getCacheHash } from "../utils";

type AnyFunction = (...arguments_: any[]) => any;

type UnwrapHook<T> = T extends ObjectHook<infer H> ? H : T extends AnyFunction ? T : never;
type HookReturn<T> = UnwrapHook<NonNullable<T>> extends AnyFunction ? Awaited<ReturnType<UnwrapHook<NonNullable<T>>>> : never;

const PACKEM_CACHE_WRAPPED = "__packem_cache_wrapped" as const;
const PACKEM_WATCH_FILES = "__packem_watch_files" as const;

interface WrappedCacheValue {
    data: unknown;
    [PACKEM_CACHE_WRAPPED]: true;
}

interface WatchFilesCacheValue {
    [PACKEM_WATCH_FILES]: string[];
    result: unknown;
}

const getHandler = (plugin: ObjectHook<AnyFunction> | AnyFunction): AnyFunction => {
    if (typeof plugin === "function") {
        return plugin;
    }

    return (plugin as { handler: AnyFunction }).handler;
};

// When a wrapped plugin declares a native hook `filter` (object-hook form), forward
// it onto the cache wrapper's hook so rolldown/rollup can skip both the cache lookup
// AND the inner handler for non-matching ids — without forwarding, the wrapper hook
// has no filter and is invoked for every module, defeating the inner plugin's filter.
const getHookFilter = (hook: ObjectHook<AnyFunction> | AnyFunction | undefined): unknown => {
    if (hook && typeof hook === "object" && "filter" in hook) {
        return (hook as { filter?: unknown }).filter;
    }

    return undefined;
};

// `resolveId` is called once per import edge, but the `options` object only ever
// takes a handful of distinct shapes across a whole build (isEntry true/false plus
// the occasional `custom`/`attributes` variant). Hashing it fresh every call means a
// SHA-1 digest per edge; memoizing by the stringified options collapses that to one
// digest per distinct shape. The key space is tiny and bounded, so an unbounded Map
// is fine for a per-process build cache.
const resolveOptionsHashCache = new Map<string, string>();

const hashResolveOptions = (options: unknown): string => {
    const key = JSON.stringify(options);

    let hash = resolveOptionsHashCache.get(key);

    if (hash === undefined) {
        hash = getCacheHash(key);
        resolveOptionsHashCache.set(key, hash);
    }

    return hash;
};

const isWrappedCacheValue = (value: unknown): value is WrappedCacheValue =>
    value !== null && typeof value === "object" && (value as Partial<WrappedCacheValue>)[PACKEM_CACHE_WRAPPED] === true;

const isWatchFilesCacheValue = (value: unknown): value is WatchFilesCacheValue =>
    value !== null && typeof value === "object" && Array.isArray((value as Partial<WatchFilesCacheValue>)[PACKEM_WATCH_FILES]);

const unwrapCachedValue = (value: unknown): unknown => {
    if (isWrappedCacheValue(value)) {
        return value.data;
    }

    return value;
};

/**
 * Wrap a Rollup plugin to add caching to various hooks.
 * @param plugin
 * @param cache
 * @param subDirectory
 * @returns
 */
const cachePlugin = (plugin: Plugin, cache: FileCache, subDirectory = ""): Plugin => {
    // When the cache is disabled, the wrapper would still hash every module's id and
    // full source on each hook (to build a cache key) only for `cache.get()` to
    // return undefined immediately. Skip wrapping entirely and return the plugin
    // as-is so it runs natively — keeping its own hook filters. `isEnabled` is set
    // before build options are constructed, so it's stable for the wrapper's lifetime.
    if (!cache.isEnabled) {
        return plugin;
    }

    // `pluginPath` is invariant for the lifetime of the wrapper — `subDirectory`
    // and `plugin.name` don't change between hook calls — so compute it once
    // instead of re-joining on every load/resolveId/transform invocation.
    const pluginPath = join(subDirectory, plugin.name);

    const wrapped = <Plugin>{
        ...plugin,

        async buildEnd(error) {
            if (plugin.buildEnd) {
                await getHandler(plugin.buildEnd).call(this, error);
            }
        },

        async buildStart(options) {
            if (plugin.buildStart) {
                await getHandler(plugin.buildStart).call(this, options);
            }
        },

        async load(id) {
            if (!plugin.load) {
                return undefined;
            }

            // Support query params in id (e.g., ?raw). Keep the query as part of the cache key,
            // but compute file fingerprint using the clean path (without query) when possible.
            const cleanId = id.includes("?") ? (id.split("?")[0] as string) : id;

            let contentHash = "";

            try {
                if (cleanId && isAccessibleSync(cleanId)) {
                    const fileContent = readFileSync(cleanId);

                    contentHash = getCacheHash(fileContent);
                }
            } catch {
                // Ignore fingerprint errors; fall back to id-only based caching
            }

            const cacheKey = join("load", getCacheHash(id), contentHash);

            // `cache.get()` returns `undefined` only on a true miss — every
            // hit is wrapped (either as a code-object, WrappedCacheValue, or
            // WatchFilesCacheValue), so a single `get` saves the redundant
            // `isAccessibleSync` syscall that `has()` would do before `get`.
            const cached = await cache.get(cacheKey, pluginPath);

            if (cached !== undefined) {
                return unwrapCachedValue(cached) as HookReturn<Plugin["load"]>;
            }

            const result: unknown = await getHandler(plugin.load).call(this, id);

            // A null/undefined return means the plugin didn't handle this id (Rollup
            // falls through to the next loader). Caching that "miss" wrote one file
            // per module for every load-only plugin — e.g. the raw plugin emitted
            // ~10k useless entries on a many-module build — for no payoff, since
            // re-running a no-op load on a warm build is just a cheap early return.
            // Skip the write entirely.
            if (result === undefined || result === null) {
                return result;
            }

            // Store raw plugin results in a wrapped form to avoid type coercion issues
            const toStore: unknown
                = typeof result === "object" && "code" in (result as Record<string, unknown>)
                    ? result
                    : ({ data: result, [PACKEM_CACHE_WRAPPED]: true } satisfies WrappedCacheValue);

            cache.set(cacheKey, toStore as Parameters<typeof cache.set>[1], pluginPath);

            return result as HookReturn<Plugin["load"]>;
        },

        name: `cached(${plugin.name})`,

        async resolveId(id, importer, options) {
            if (!plugin.resolveId) {
                return undefined;
            }

            const cacheKey = join("resolveId", getCacheHash(id), importer ? getCacheHash(importer) : "", hashResolveOptions(options));

            const cached = await cache.get(cacheKey, pluginPath);

            if (cached !== undefined) {
                return unwrapCachedValue(cached) as HookReturn<Plugin["resolveId"]>;
            }

            const result: unknown = await getHandler(plugin.resolveId).call(this, id, importer, options);

            // Most plugins return null/undefined for most ids (didn't handle this
            // import edge). FileCache serializes `null` to the string "null", so
            // caching these "misses" writes one useless file per unmatched id — the
            // same blow-up the load hook avoids. Skip the write; a warm re-run of a
            // no-op resolveId is a cheap early return.
            if (result === undefined || result === null) {
                return result;
            }

            cache.set(cacheKey, result, pluginPath);

            return result as HookReturn<Plugin["resolveId"]>;
        },

        async transform(code, id) {
            if (!plugin.transform) {
                return undefined;
            }

            const cacheKey = join("transform", getCacheHash(id), getCacheHash(code));

            const cachedRaw = await cache.get(cacheKey, pluginPath);

            if (cachedRaw !== undefined) {
                const cached: unknown = unwrapCachedValue(cachedRaw);

                // Replay any addWatchFile calls that were captured during the original transform.
                // This ensures rollup knows to invalidate this cached result when source
                // dependencies (e.g. JSX/TSX files scanned by Tailwind) change.
                if (isWatchFilesCacheValue(cached)) {
                    for (const watchFile of cached[PACKEM_WATCH_FILES]) {
                        this.addWatchFile(watchFile);
                    }

                    return unwrapCachedValue(cached.result) as HookReturn<Plugin["transform"]>;
                }

                return cached as HookReturn<Plugin["transform"]>;
            }

            // Intercept addWatchFile calls so we can store them alongside the cached result.
            // Rollup's plugin-context methods are closures that don't read `this`, so a
            // prototype-delegating object inherits them safely while overriding just
            // `addWatchFile` — far cheaper than a Proxy (which rebinds every method on
            // every property access) on each transform cache miss. The override arrow's
            // `this` is lexically the original context, so `this.addWatchFile` resolves up
            // the prototype chain to the real implementation without recursing.
            const watchFiles: string[] = [];
            const contextWithWatcher = Object.create(this) as typeof this;

            contextWithWatcher.addWatchFile = (file: string): void => {
                watchFiles.push(file);
                this.addWatchFile(file);
            };

            const result: unknown = await getHandler(plugin.transform).call(contextWithWatcher, code, id);

            if (watchFiles.length > 0) {
                cache.set(cacheKey, { [PACKEM_WATCH_FILES]: watchFiles, result } satisfies WatchFilesCacheValue, pluginPath);
            } else if (result !== undefined && result !== null) {
                // A null/undefined return means the plugin didn't transform this module.
                // FileCache serializes `null` to "null", so caching the "miss" writes a
                // useless file per unmatched module (most transforms return null for most
                // ids). Skip the write — re-running a no-op transform is a cheap early
                // return. (When watch files were captured we still cache, above, so their
                // invalidation edges survive a warm build.)
                cache.set(cacheKey, result, pluginPath);
            }

            return result as HookReturn<Plugin["transform"]>;
        },
    };

    // Forward any native hook `filter` the wrapped plugin declared onto the cache
    // wrapper's hook (object-hook form), so rolldown/rollup skip both the cache
    // lookup and the inner handler for non-matching ids. Done as a post-step so the
    // handler bodies above stay plain methods. The wrapper hooks are always defined
    // here (as functions), so getHandler unwraps the method into the new handler.
    const loadFilter = getHookFilter(plugin.load);
    const resolveIdFilter = getHookFilter(plugin.resolveId);
    const transformFilter = getHookFilter(plugin.transform);

    if (loadFilter && wrapped.load) {
        wrapped.load = { filter: loadFilter, handler: getHandler(wrapped.load) };
    }

    if (resolveIdFilter && wrapped.resolveId) {
        wrapped.resolveId = { filter: resolveIdFilter, handler: getHandler(wrapped.resolveId) };
    }

    if (transformFilter && wrapped.transform) {
        wrapped.transform = { filter: transformFilter, handler: getHandler(wrapped.transform) };
    }

    return wrapped;
};

export default cachePlugin;
