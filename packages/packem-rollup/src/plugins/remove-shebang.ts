// Forked from https://github.com/developit/rollup-plugin-preserve-shebang (1.0.1 @ MIT)
import { chmod } from "node:fs/promises";

import { resolve } from "@visulima/path";
import MagicString from "magic-string";
import type { Plugin, SourceMapInput } from "rollup";

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
                 * Those assumptions are also made by acorn, babel and swc:
                 *
                 * - acorn: https://github.com/acornjs/acorn/blob/8da1fdd1918c9a9a5748501017262ce18bb2f2cc/acorn/src/state.js#L78
                 * - babel: https://github.com/babel/babel/blob/86fee43f499c76388cab495c8dcc4e821174d4e0/packages/babel-parser/src/tokenizer/index.ts#L574
                 * - swc: https://github.com/swc-project/swc/blob/7bf4ab39b0e49759d9f5c8d7f989b3ed010d81a7/crates/swc_ecma_parser/src/lexer/mod.rs#L204
                 */
                const hasShebang = code.startsWith("#") && code[1] === "!";

                if (hasShebang && options.replace) {
                    return code.replace(SHEBANG_RE, `${options.shebang}\n`);
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
                        map: outputOptions.sourcemap ? (transformed.generateMap({ hires: true }) as SourceMapInput) : undefined,
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
                    const outFile = resolve(bundleOptions.dir as string, fileName);

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

    return m ? m + append : "";
};

export default removeShebangPlugin;
