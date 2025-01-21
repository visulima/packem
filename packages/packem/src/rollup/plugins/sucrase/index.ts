import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "rollup";
import { transform as sucraseTransform } from "sucrase";

import { EXCLUDE_REGEXP } from "../../../constants";
import type { TransformerFn as TransformerFunction } from "../../../types";
import type { SucrasePluginConfig } from "./types";

const sucrasePlugin = ({ exclude, include, ...transformOptions }: SucrasePluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:sucrase",

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
export default sucrasePlugin as TransformerFunction;
