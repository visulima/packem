import { createFilter } from "@rollup/pluginutils";
import { transform as swcTransform } from "@swc/core";
import type { TransformerFn as TransformerFunction } from "@visulima/packem-plugins";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";

import type { SwcPluginConfig } from "./types";

const swcPlugin = ({ exclude, include, ...transformOptions }: SwcPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:swc",

        // Native Rollup hook filtering (Rollup 4.38.0+) lets Rollup skip calling
        // this hook for non-matching ids before the JS `createFilter` runs. The
        // precise include/exclude semantics are still enforced by `filter(id)`
        // below; this is a cheap pre-gate, so it must be at least as permissive.
        transform: {
            filter: {
                id: { exclude: exclude ?? EXCLUDE_REGEXP, include },
            },
            async handler(sourcecode, id) {
                if (!filter(id)) {
                    return undefined;
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
        },
    };
};

swcPlugin.NAME = "swc";

export default swcPlugin as TransformerFunction<SwcPluginConfig>;
