import { createFilter } from "@rollup/pluginutils";
import { transform } from "oxc-transform";
import type { Plugin } from "rollup";

import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { TransformerFn as TransformerFunction } from "../../../types";
import type { InternalOXCTransformPluginConfig } from "./types";

const oxcTransformPlugin: TransformerFunction = ({ exclude, include, ...transformOptions }: InternalOXCTransformPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:oxc-transform",

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return undefined;
            }

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
    };
};

oxcTransformPlugin.NAME = "oxc";

export default oxcTransformPlugin;
