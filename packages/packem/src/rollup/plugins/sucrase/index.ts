import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "rollup";
import { transform as sucraseTransform } from "sucrase";

import { DEFAULT_EXTENSIONS, EXCLUDE_REGEXP } from "../../../constants";
import type { TransformerFn as TransformerFunction } from "../../../types";
import resolvedIdCache from "../../utils/resolved-id-cache";
import type { SucrasePluginConfig } from "./types";

const sucrasePlugin: TransformerFunction = ({ exclude, extensions = DEFAULT_EXTENSIONS, include, ...transformOptions }: SucrasePluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    // Initialize own resolution cache.
    const resolveIdCache = new Map<string, string | null>();

    return <Plugin>{
        name: "packem:sucrase",
        async resolveId(id, importer, { isEntry }): Promise<string | null> {
            return await resolvedIdCache(resolveIdCache, { filter, id, importer, isEntry }, extensions);
        },

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return null;
            }

            const { code, sourceMap: map } = sucraseTransform(sourcecode, {
                ...transformOptions,
                filePath: id,
                sourceMapOptions: {
                    compiledFilename: id,
                },
            });

            return { code, map };
        },
    };
};

sucrasePlugin.NAME = "sucrase";

// eslint-disable-next-line import/no-unused-modules
export default sucrasePlugin;
