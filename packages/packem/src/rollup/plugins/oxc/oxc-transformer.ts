import { createFilter } from "@rollup/pluginutils";
import { transform } from "oxc-transform";
import type { Plugin } from "rollup";

import { DEFAULT_EXTENSIONS, EXCLUDE_REGEXP } from "../../../constants";
import type { TransformerFn as TransformerFunction } from "../../../types";
import resolvedIdCache from "../../utils/resolved-id-cache";
import type { InternalOXCTransformPluginConfig } from "./types";

const oxcTransformPlugin: TransformerFunction = ({
    exclude,
    extensions = DEFAULT_EXTENSIONS,
    include,
    ...transformOptions
}: InternalOXCTransformPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    // Initialize own resolution cache.
    const resolveIdCache = new Map<string, string | null>();

    return <Plugin>{
        name: "packem:oxc-transform",
        async resolveId(id, importer, { isEntry }): Promise<string | null> {
            return await resolvedIdCache(resolveIdCache, { filter, id, importer, isEntry }, extensions);
        },

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return null;
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

// eslint-disable-next-line import/no-unused-modules
export default oxcTransformPlugin;
