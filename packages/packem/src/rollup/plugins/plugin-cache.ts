import { join } from "@visulima/path";
import type { ObjectHook, Plugin } from "rollup";

import type FileCache from "../../utils/file-cache";
import getHash from "../utils/get-hash";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getHandler = (plugin: ObjectHook<any> | ((...arguments_: any[]) => any)): ((...arguments_: any[]) => any) => plugin.handler || plugin;

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
            const cacheKey = join("load", getHash(id));

            if (cache.has(cacheKey, pluginPath)) {
                return await cache.get(cacheKey, pluginPath);
            }

            const result = await getHandler(plugin.load).call(this, id);

            cache.set(cacheKey, result, pluginPath);

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
                return await cache.get(cacheKey, pluginPath);
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
                return await cache.get(cacheKey, pluginPath);
            }

            const result = await getHandler(plugin.transform).call(this, code, id);

            cache.set(cacheKey, result, pluginPath);

            return result;
        },
    };

export default cachingPlugin;
