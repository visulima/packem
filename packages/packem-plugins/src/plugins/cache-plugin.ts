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
    // `pluginPath` is invariant for the lifetime of the wrapper — `subDirectory`
    // and `plugin.name` don't change between hook calls — so compute it once
    // instead of re-joining on every load/resolveId/transform invocation.
    const pluginPath = join(subDirectory, plugin.name);

    return <Plugin>{
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

            // Store raw plugin results in a wrapped form to avoid type coercion issues
            const toStore: unknown
                = result && typeof result === "object" && "code" in (result as Record<string, unknown>)
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

            const cacheKey = join("resolveId", getCacheHash(id), importer ? getCacheHash(importer) : "", getCacheHash(JSON.stringify(options)));

            const cached = await cache.get(cacheKey, pluginPath);

            if (cached !== undefined) {
                return unwrapCachedValue(cached) as HookReturn<Plugin["resolveId"]>;
            }

            const result: unknown = await getHandler(plugin.resolveId).call(this, id, importer, options);

            cache.set(cacheKey, result as Parameters<typeof cache.set>[1], pluginPath);

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
            const watchFiles: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment -- need stable reference for the Proxy handler below.
            const pluginContext = this;
            const contextWithWatcher = new Proxy(this, {
                get(target, prop, receiver) {
                    if (prop === "addWatchFile") {
                        return (file: string) => {
                            watchFiles.push(file);
                            pluginContext.addWatchFile(file);
                        };
                    }

                    const value: unknown = Reflect.get(target, prop, receiver);

                    return typeof value === "function" ? (value as AnyFunction).bind(target) : value;
                },
            });

            const result: unknown = await getHandler(plugin.transform).call(contextWithWatcher, code, id);

            if (watchFiles.length > 0) {
                cache.set(cacheKey, { [PACKEM_WATCH_FILES]: watchFiles, result } satisfies WatchFilesCacheValue, pluginPath);
            } else {
                cache.set(cacheKey, result as Parameters<typeof cache.set>[1], pluginPath);
            }

            return result as HookReturn<Plugin["transform"]>;
        },
    };
};

export default cachePlugin;
