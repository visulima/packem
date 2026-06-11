import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { TransformerFn as TransformerFunction } from "@visulima/packem-plugins";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";
import type { Options } from "sucrase";
import { transform as sucraseTransform } from "sucrase";

const sucraseTransformPlugin = ({ exclude, include, ...transformOptions }: SucrasePluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:sucrase",

        // Native Rollup hook filtering (Rollup 4.38.0+) lets Rollup skip calling
        // this hook for non-matching ids before the JS `createFilter` runs. The
        // precise include/exclude semantics are still enforced by `filter(id)`
        // below; this is a cheap pre-gate, so it must be at least as permissive.
        transform: {
            filter: {
                id: { exclude: exclude ?? EXCLUDE_REGEXP, include },
            },
            handler(sourcecode, id) {
                if (!filter(id)) {
                    return undefined;
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
        },
    };
};

sucraseTransformPlugin.NAME = "sucrase";

export interface SucrasePluginConfig extends Options {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const sucrasePlugin = sucraseTransformPlugin as TransformerFunction<SucrasePluginConfig>;
