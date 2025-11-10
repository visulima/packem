import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import { transform } from "oxc-transform";
import type { Plugin } from "rollup";

import type { TransformerFn as TransformerFunction } from "../../types";
import type { InternalOXCTransformPluginConfig } from "./types";

const oxcTransformPlugin: TransformerFunction = ({ exclude, include, ...transformOptions }: InternalOXCTransformPluginConfig): Plugin => {
    // Create filter function for include/exclude patterns
    const filterFn = createFilter(include, exclude ?? EXCLUDE_REGEXP);
    const idFilter = (id: string) => filterFn(id);

    return <Plugin>{
        name: "packem:oxc-transform",

        transform: {
            filter: {
                id: idFilter,
            },
            async handler(sourcecode, id) {

            const { code, errors, map } = transform(id, sourcecode, {
                ...transformOptions,
                sourcemap: true,
            });

            if (errors.length > 0) {
                return this.error({
                    message: ["\ntransform errors:", ...errors].join("\n\n"),
                    pluginCode: "ERR_TRANSFORM",
                });
            }

            return {
                code,
                map,
            };
            },
        },
    };
};

oxcTransformPlugin.NAME = "oxc";

export default oxcTransformPlugin;
