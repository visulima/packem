import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";
import type { ObjectHook, Plugin } from "rollup";

import type FileCache from "../../utils/file-cache";
import getHash from "../utils/get-hash";

// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return,@typescript-eslint/no-redundant-type-constituents
const getHandler = (plugin: ObjectHook<any> | ((...arguments_: any[]) => any)): ((...arguments_: any[]) => any) => plugin.handler || plugin;

/**
 * Wrap a Rollup plugin to add caching to various hooks.
 */
const cachingPlugin = (plugin: Plugin, cache: FileCache, logger: Pail, subDirectory = ""): Plugin =>
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
                return null;
            }

            const pluginPath = join(subDirectory, plugin.name);
            const cacheKey = join("load", getHash(id));

            if (cache.has(cacheKey, pluginPath)) {
                logger.debug({
                    message: 'Cache hit for "load" hook with cache key: ' + cacheKey,
                    prefix: "plugin:cache-plugin:" + plugin.name,
                });

                return await cache.get(cacheKey, pluginPath);
            }

            const result = await getHandler(plugin.load).call(this, id);

            cache.set(cacheKey, result, pluginPath);

            logger.debug({
                message: 'Cache miss for "load" hook with cache key: ' + cacheKey + ". Caching result.",
                prefix: "plugin:cache-plugin:" + plugin.name,
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        },

        name: `cached(${plugin.name})`,

        async resolveId(id, importer, options) {
            if (!plugin.resolveId) {
                return null;
            }

            const pluginPath = join(subDirectory, plugin.name);
            const cacheKey = join("resolveId", getHash(id), importer ? getHash(importer) : "", getHash(JSON.stringify(options)));

            if (cache.has(cacheKey, pluginPath)) {
                logger.debug({
                    message: 'Cache hit for "resolveId" hook with cache key: ' + cacheKey,
                    prefix: "plugin:cache-plugin:" + plugin.name,
                });

                return await cache.get(cacheKey, pluginPath);
            }

            const result = await getHandler(plugin.resolveId).call(this, id, importer, options);

            cache.set(cacheKey, result, pluginPath);

            logger.debug({
                message: 'Cache miss for "resolveId" hook with cache key: ' + cacheKey + ". Caching result.",
                prefix: "plugin:cache-plugin:" + plugin.name,
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        },

        async transform(code, id) {
            if (!plugin.transform) {
                return null;
            }

            const pluginPath = join(subDirectory, plugin.name);
            const cacheKey = join("transform", getHash(id), getHash(code));

            if (cache.has(cacheKey, pluginPath)) {
                logger.debug({
                    message: 'Cache hit for "transform" hook with cache key: ' + cacheKey,
                    prefix: "plugin:cache-plugin:" + plugin.name,
                });

                return await cache.get(cacheKey, pluginPath);
            }

            const result = await getHandler(plugin.transform).call(this, code, id);

            cache.set(cacheKey, result, pluginPath);

            logger.debug({
                message: 'Cache miss for "transform" hook with cache key: ' + cacheKey + ". Caching result.",
                prefix: "plugin:cache-plugin:" + plugin.name,
            });

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        },
    };

export default cachingPlugin;
