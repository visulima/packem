import type { Plugin } from "rollup";

import { RE_DTS, replaceTemplateName, resolveTemplateFunction } from "./filename";
import type { OptionsResolved } from "./options";

const createDtsInputPlugin = ({ entry, sideEffects }: Pick<OptionsResolved, "entry" | "sideEffects">): Plugin => {
    return {
        buildStart() {
            // The `entry` filter is implemented in the generate plugin, which is not
            // active in dtsInput mode. Warn rather than silently ignore it.
            if (entry) {
                this.warn(
                    "The `entry` option has no effect in `dtsInput` mode; control which declaration files are emitted via the plugin's input list instead.",
                );
            }
        },

        name: "rollup-plugin-dts:dts-input",

        options: sideEffects
            ? undefined
            : (options) => {
                  return {
                      ...options,
                      treeshake:
                          options.treeshake === false
                              ? false
                              : {
                                    ...(typeof options.treeshake === "object" && options.treeshake),
                                    moduleSideEffects: false,
                                },
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
