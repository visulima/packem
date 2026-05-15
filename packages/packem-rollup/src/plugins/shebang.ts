// Forked from https://github.com/developit/rollup-plugin-preserve-shebang (1.0.1 @ MIT)
import { chmod } from "node:fs/promises";

import { resolve } from "@visulima/path";
import MagicString from "magic-string";
import type { Plugin } from "rollup";

const SHEBANG_RE = /^#![^\n]*/;

export type ShebangOptions = {
    replace: boolean;
    shebang: string;
};

export const makeExecutable = async (filePath: string): Promise<void> => {
    await chmod(filePath, 0o755 /* rwx r-x r-x */).catch(() => {});
};

export const shebangPlugin = (executablePaths: string[], options: ShebangOptions): Plugin => {
    return {
        name: "packem:shebang",

        renderChunk: {
            handler(code, chunk, outputOptions) {
                if (!chunk.isEntry || !chunk.facadeModuleId) {
                    return undefined;
                }

                /**
                 * Here we are making 3 assumptions:
                 * - shebang can only be at the first line of the file, otherwise it will not be recognized
                 * - shebang can only contain one line
                 * - shebang must starts with # and !
                 *
                 * Those assumptions are also made by acorn, babel and swc; see their parser sources.
                 */
                const hasShebang = code.startsWith("#") && code[1] === "!";

                if (hasShebang && options.replace) {
                    return { code: code.replace(SHEBANG_RE, `${options.shebang}\n`), map: undefined };
                }

                // preserve of the shebang is handled by the `preserve-directives` plugin
                if (hasShebang) {
                    return undefined;
                }

                if (executablePaths.includes(chunk.name)) {
                    const transformed = new MagicString(code);

                    transformed.prepend(`${options.shebang}\n`);

                    return {
                        code: transformed.toString(),
                        map: outputOptions.sourcemap ? transformed.generateMap({ hires: true }) : undefined,
                    };
                }

                return undefined;
            },
            order: "post",
        },

        async writeBundle(bundleOptions, bundle) {
            for (const [fileName, output] of Object.entries(bundle)) {
                if (output.type !== "chunk") {
                    continue;
                }

                if (SHEBANG_RE.test(output.code) && bundleOptions.dir) {
                    const outFile = resolve(bundleOptions.dir, fileName);

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
    const match = SHEBANG_RE["exec"](code);

    return match ? `${match[0]}${append}` : "";
};
