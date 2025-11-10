import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";
import type { Options } from "sucrase";
import { transform as sucraseTransform } from "sucrase";

import type { TransformerFn as TransformerFunction } from "../../types";

const sucraseTransformPlugin = ({ exclude, include, ...transformOptions }: SucrasePluginConfig): Plugin => {
    // Create filter function for include/exclude patterns
    const filterFn = createFilter(include, exclude ?? EXCLUDE_REGEXP);
    const idFilter = (id: string) => filterFn(id);

    return <Plugin>{
        name: "packem:sucrase",

        transform: {
            filter: {
                id: idFilter,
            },
            async handler(sourcecode, id) {

            const { code, sourceMap: map } = sucraseTransform(sourcecode, {
                ...transformOptions,
                filePath: id,
                sourceMapOptions: {
                    compiledFilename: id,
                },
            });

            return { code, map };
            },
        },
    };
};

sucraseTransformPlugin.NAME = "sucrase";

export interface SucrasePluginConfig extends Options {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const sucrasePlugin = sucraseTransformPlugin as TransformerFunction;
