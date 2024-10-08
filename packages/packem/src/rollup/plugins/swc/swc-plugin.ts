import { existsSync, statSync } from "node:fs";

import { createFilter } from "@rollup/pluginutils";
import { transform as swcTransform } from "@swc/core";
import { dirname, resolve } from "@visulima/path";
import type { Plugin } from "rollup";

import { DEFAULT_EXTENSIONS, EXCLUDE_REGEXP } from "../../../constants";
import resolveFile from "../../utils/resolve-file";
import type { SwcPluginConfig } from "./types";

const swcPlugin = ({ exclude, extensions = DEFAULT_EXTENSIONS, include, ...transformOptions }: SwcPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    // Initialize own resolution cache.
    const resolveIdCache = new Map();

    return <Plugin>{
        name: "packem:swc",
        async resolveId(id, importer, { isEntry }): Promise<string | null> {
            if (!importer || isEntry || !filter(id) || id.startsWith("\0")) {
                return null;
            }

            // Some plugins sometimes cause the resolver to be called multiple times for the same id,
            // so we cache our results for faster response when this happens.
            // (undefined = not seen before, null = not handled by us, string = resolved)
            const resolvedId = resolveIdCache.get(id);

            if (resolvedId !== undefined) {
                return resolvedId as string | null;
            }

            if (importer && id.startsWith(".")) {
                const resolved = resolve(importer ? dirname(importer) : process.cwd(), id);

                let file = resolveFile(extensions, resolved);

                if (file) {
                    resolveIdCache.set(id, file);

                    return file as string;
                }

                // eslint-disable-next-line security/detect-non-literal-fs-filename
                if (!file && existsSync(resolved) && statSync(resolved).isDirectory()) {
                    file = resolveFile(extensions, resolved, true);

                    if (file) {
                        resolveIdCache.set(id, file);

                        return file as string;
                    }
                }
            }

            resolveIdCache.set(id, null);

            return null;
        },

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return null;
            }

            const { code, map } = await swcTransform(sourcecode, {
                ...transformOptions,
                configFile: false,
                filename: id,
                swcrc: false,
            });

            return {
                code,
                map,
            };
        },
    };
};

// eslint-disable-next-line import/no-unused-modules
export default swcPlugin;
