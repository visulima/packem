import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import { transform } from "oxc-transform";
import type { Plugin } from "rollup";

import type { TransformerFn as TransformerFunction } from "../../types";
import type { InternalOXCTransformPluginConfig } from "./types";

const oxcTransformPlugin: TransformerFunction<InternalOXCTransformPluginConfig> = ({
    exclude,
    include,
    ...transformOptions
}: InternalOXCTransformPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    return <Plugin>{
        name: "packem:oxc-transform",

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return undefined;
            }

            const result = await transform(id, sourcecode, {
                ...transformOptions,
                sourcemap: true,
            });

            const { code, errors, map } = result;

            if (errors.length > 0) {
                const errorMessages = errors.map((error) => {
                    if (typeof error === "string") {
                        return error;
                    }

                    return (error as { message?: string }).message ?? JSON.stringify(error);
                });

                return this.error({
                    message: ["\ntransform errors:", ...errorMessages].join("\n\n"),
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
