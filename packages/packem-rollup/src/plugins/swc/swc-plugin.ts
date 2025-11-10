import { transform as swcTransform } from "@swc/core";
import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";

import type { TransformerFn as TransformerFunction } from "../../types";
import type { SwcPluginConfig } from "./types";

const swcPlugin = ({ exclude, include, ...transformOptions }: SwcPluginConfig): Plugin => {
    // Create filter function for include/exclude patterns
    const filterFn = createFilter(include, exclude ?? EXCLUDE_REGEXP);
    const idFilter = (id: string) => filterFn(id);

    return <Plugin>{
        name: "packem:swc",

        transform: {
            filter: {
                id: idFilter,
            },
            async handler(sourcecode, id) {

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

export default swcPlugin as TransformerFunction;
