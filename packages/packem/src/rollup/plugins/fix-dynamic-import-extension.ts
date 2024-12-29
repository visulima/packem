import type { Plugin } from "rollup";

const fixDynamicImportExtension = (): Plugin =>
    ({
        name: "packem:fix-dynamic-import-extension",
        renderChunk(code, _chunk, options) {
            if (options.format === "es" || options.format === "cjs") {
                return {
                    code: code.replaceAll(/(import\(.*)(\.ts)(['´"`]\))/g, "$1." + (options.format === "es" ? "mjs" : "cjs") + "$3"),
                    map: null,
                };
            }

            return null;
        },
    }) as Plugin;

export default fixDynamicImportExtension;
