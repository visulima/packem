import type { Plugin } from "rollup";

import { RE_DTS, replaceTemplateName, resolveTemplateFn as resolveTemplateFunction } from "./filename.js";

const createDtsInputPlugin = (): Plugin => {
    return {
        name: "rollup-plugin-dts:dts-input",

        options(options) {
            return {
                treeshake:
                    options.treeshake === false
                        ? false
                        : {
                            ...options.treeshake === true ? {} : options.treeshake,
                            moduleSideEffects: false,
                        },
                ...options,
            };
        },

        outputOptions(options) {
            return {
                ...options,
                entryFileNames(chunk) {
                    const { entryFileNames } = options;

                    if (entryFileNames) {
                        const nameTemplate = resolveTemplateFunction(entryFileNames, chunk);

                        const renderedName = replaceTemplateName(nameTemplate, chunk.name);

                        if (RE_DTS.test(renderedName)) {
                            return nameTemplate;
                        }

                        const renderedNameWithD = replaceTemplateName(nameTemplate, `${chunk.name}.d`);

                        if (RE_DTS.test(renderedNameWithD)) {
                            return renderedNameWithD;
                        }

                        // Ignore the user-defined entryFileNames if it doesn't match the dts pattern
                    }

                    if (RE_DTS.test(chunk.name)) {
                        return chunk.name;
                    }

                    if (chunk.name.endsWith(".d")) {
                        return "[name].ts";
                    }

                    return "[name].d.ts";
                },
            };
        },
    };
};

export default createDtsInputPlugin;
