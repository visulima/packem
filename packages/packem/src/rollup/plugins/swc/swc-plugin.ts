import { createFilter } from "@rollup/pluginutils";
import { transform as swcTransform } from "@swc/core";
import type { Plugin } from "rollup";

import { DEFAULT_EXTENSIONS, EXCLUDE_REGEXP } from "../../../constants";
import resolvedIdCache from "../../utils/resolved-id-cache";
import type { SwcPluginConfig } from "./types";
import type { TransformerFn as TransformerFunction } from "../../../types";

const swcPlugin: TransformerFunction = ({ exclude, extensions = DEFAULT_EXTENSIONS, include, ...transformOptions }: SwcPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    // Initialize own resolution cache.
    const resolveIdCache = new Map<string, string | null>();

    return <Plugin>{
        name: "packem:swc",
        async resolveId(id, importer, { isEntry }): Promise<string | null> {
            return await resolvedIdCache(resolveIdCache, { filter, id, importer, isEntry }, extensions);
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

swcPlugin.NAME = "swc";

// eslint-disable-next-line import/no-unused-modules
export default swcPlugin;
