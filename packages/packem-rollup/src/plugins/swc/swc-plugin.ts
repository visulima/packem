import { createFilter } from "@rollup/pluginutils";
import { transform as swcTransform } from "@swc/core";
import type { Plugin } from "rollup";

import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { TransformerFn as TransformerFunction } from "../../types";
import type { SwcPluginConfig } from "./types";

const swcPlugin = ({ exclude, include, ...transformOptions }: SwcPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:swc",

        async transform(sourcecode, id) {
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
    };
};

swcPlugin.NAME = "swc";

export default swcPlugin as TransformerFunction;
