import { isAccessibleSync, readFileSync } from "@visulima/fs";
import type { FileCache } from "@visulima/packem-share/utils";
import { join } from "@visulima/path";
import type { ObjectHook, Plugin } from "rollup";

import { getHash } from "../utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getHandler = (plugin: ObjectHook<any> | ((...arguments_: any[]) => any)): (...arguments_: any[]) => any => plugin.handler || plugin;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrapCachedValue = (value: any) => {
    if (value && typeof value === "object" && value.__packem_cache_wrapped === true) {
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
const cachingPlugin = (plugin: Plugin, cache: FileCache, subDirectory = ""): Plugin =>
    <Plugin>{
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

            const pluginPath = join(subDirectory, plugin.name);
            // Support query params in id (e.g., ?raw). Keep the query as part of the cache key,
            // but compute file fingerprint using the clean path (without query) when possible.
            const cleanId = id.includes("?") ? (id.split("?")[0] as string) : id;

            let contentHash = "";

            try {
                if (cleanId && isAccessibleSync(cleanId)) {
                    const fileContent = readFileSync(cleanId);

                    contentHash = getHash(fileContent);
                }
            } catch {
                // Ignore fingerprint errors; fall back to id-only based caching
            }

            const cacheKey = join("load", getHash(id), contentHash);

            if (cache.has(cacheKey, pluginPath)) {
                return unwrapCachedValue(await cache.get(cacheKey, pluginPath));
            }

            const result = await getHandler(plugin.load).call(this, id);

            // Store raw plugin results in a wrapped form to avoid type coercion issues
            const toStore
                = result && typeof result === "object" && "code" in (result as Record<string, unknown>)
                    ? result
                    : { __packem_cache_wrapped: true, data: result };

            cache.set(cacheKey, toStore, pluginPath);

            return result;
        },

        name: `cached(${plugin.name})`,

        async resolveId(id, importer, options) {
            if (!plugin.resolveId) {
                return undefined;
            }

            const pluginPath = join(subDirectory, plugin.name);
            const cacheKey = join("resolveId", getHash(id), importer ? getHash(importer) : "", getHash(JSON.stringify(options)));

            if (cache.has(cacheKey, pluginPath)) {
                return unwrapCachedValue(await cache.get(cacheKey, pluginPath));
            }

            const result = await getHandler(plugin.resolveId).call(this, id, importer, options);

            cache.set(cacheKey, result, pluginPath);

            return result;
        },

        async transform(code, id) {
            if (!plugin.transform) {
                return undefined;
            }

            const pluginPath = join(subDirectory, plugin.name);
            const cacheKey = join("transform", getHash(id), getHash(code));

            if (cache.has(cacheKey, pluginPath)) {
                return unwrapCachedValue(await cache.get(cacheKey, pluginPath));
            }

            const result = await getHandler(plugin.transform).call(this, code, id);

            cache.set(cacheKey, result, pluginPath);

            return result;
        },
    };

export default cachingPlugin;
