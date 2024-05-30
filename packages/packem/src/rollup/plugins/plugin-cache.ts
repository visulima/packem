import { createHash } from "node:crypto";

import { join } from "@visulima/path";
import type { ObjectHook, Plugin } from "rollup";

import type FileCache from "../../utils/file-cache";

// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-return,@typescript-eslint/no-redundant-type-constituents
const getHandler = (plugin: ObjectHook<any> | ((...arguments_: any[]) => any)): ((...arguments_: any[]) => any) => plugin.handler || plugin;

/**
 * Wrap a Rollup plugin to add caching to various hooks.
 *
 * @param {Plugin} plugin
 * @param {FileCache} cache
 * @returns {Plugin}
 */
const cachingPlugin = (plugin: Plugin, cache: FileCache): Plugin => {
    const getCacheVersion = (data: Buffer | string) => {
        const hash = createHash("md5");

        hash.update(data);

        return hash.digest("hex");
    };

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
                return null;
            }

            const cacheKey = join("load", id);


            if (cache.has(cacheKey, plugin.name)) {
                return await cache.get(cacheKey, plugin.name);
            }

            const result = await getHandler(plugin.load).call(this, id);

            cache.set(cacheKey, result, plugin.name);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        },

        name: `cached(${plugin.name})`,

        async resolveId(id, importer, options) {
            if (!plugin.resolveId) {
                return null;
            }

            const cacheKey = join("resolveId", getCacheVersion(JSON.stringify(options)), importer ?? "", id);

            if (cache.has(cacheKey, plugin.name)) {
                return await cache.get(cacheKey, plugin.name);
            }

            const result = await getHandler(plugin.resolveId).call(this, id, importer, options);

            cache.set(cacheKey, result, plugin.name);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        },

        async transform(code, id) {
            if (!plugin.transform) {
                return null;
            }

            const cacheKey = join("transform", getCacheVersion(code), id);

            if (cache.has(cacheKey, plugin.name)) {
                return await cache.get(cacheKey, plugin.name);
            }

            const result = await getHandler(plugin.transform).call(this, code, id);

            cache.set(cacheKey, result, plugin.name);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        },
    };
};

export default cachingPlugin;
