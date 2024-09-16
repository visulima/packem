// Forked from https://github.com/developit/rollup-plugin-preserve-shebang (1.0.1 @ MIT)
import { chmod } from "node:fs/promises";

import { resolve } from "@visulima/path";
import MagicString from "magic-string";
import type { Plugin, SourceMapInput } from "rollup";

const SHEBANG_RE = /^#![^\n]*/;

export const makeExecutable = async (filePath: string): Promise<void> => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await chmod(filePath, 0o755 /* rwx r-x r-x */).catch(() => {});
};

export const shebangPlugin = (executablePaths: string[], shebang: string): Plugin => {
    return {
        name: "packem:shebang",

        renderChunk: {
            handler(code, chunk, outputOptions) {
                if (!chunk.isEntry || !chunk.facadeModuleId) {
                    return null;
                }

                // preserve of the shebang is handled by the `preserve-directives` plugin
                if (code.startsWith("#") && code[1] === "!") {
                    return null;
                }

                if (executablePaths.includes(chunk.name)) {
                    const transformed = new MagicString(code);

                    transformed.prepend(shebang + "\n");

                    return {
                        code: transformed.toString(),
                        map: outputOptions.sourcemap ? (transformed.generateMap({ hires: true }) as SourceMapInput) : undefined,
                    };
                }

                return null;
            },
            order: "post",
        },

        async writeBundle(options, bundle) {
            for (const [fileName, output] of Object.entries(bundle)) {
                if (output.type !== "chunk") {
                    // eslint-disable-next-line no-continue
                    continue;
                }

                if (SHEBANG_RE.test(output.code) && options.dir) {
                    const outFile = resolve(options.dir as string, fileName);

                    // eslint-disable-next-line no-await-in-loop
                    await makeExecutable(outFile);
                }
            }
        },
    };
};

export const removeShebangPlugin = (): Plugin => {
    return {
        name: "packem:remove-shebang",
        renderChunk(code) {
            return code.replace(SHEBANG_RE, "");
        },
    };
};

export const getShebang = (code: string, append = "\n"): string => {
    const m = SHEBANG_RE.exec(code);

    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    return m ? m + append : "";
};
