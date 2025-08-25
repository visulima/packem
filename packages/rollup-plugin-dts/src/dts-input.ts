import type { Plugin } from "rollup";

export function createDtsInputPlugin(): Plugin {
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
                    if (chunk.name.endsWith(".d")) {
                        return "[name].ts";
                    }

                    return "[name].d.ts";
                },
            };
        },
    };
}
