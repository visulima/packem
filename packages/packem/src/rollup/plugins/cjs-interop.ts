import type { Pail } from "@visulima/pail";
import MagicString from "magic-string";
import type { NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput } from "rollup";

import patchCjsDefaultExport from "./typescript/utils/patch-cjs-default-export";

export interface CJSInteropOptions {
    addDefaultProperty?: boolean;
}

export const cjsInteropPlugin = ({
    addDefaultProperty = false,
    logger,
    type,
}: CJSInteropOptions & {
    logger: Pail;
    type: "commonjs" | "module";
}): Plugin => {
    return {
        name: "packem:cjs-interop",
        renderChunk: async (
            code: string,
            chunk: RenderedChunk,
            options: NormalizedOutputOptions,
        ): Promise<{
            code: string;
            map: SourceMapInput;
        } | undefined> => {
            if (chunk.type !== "chunk" || !chunk.isEntry) {
                return undefined;
            }

            if (options.format === "cjs" && options.exports === "auto") {
                const matches = /(exports(?:\['default'\]|\.default)) = (.*);/i.exec(code);

                if (matches === null || matches.length < 3) {
                    return undefined;
                }

                const transformed = new MagicString(code);

                // remove `__esModule` marker property
                transformed.replace("Object.defineProperty(exports, '__esModule', { value: true });", "");
                // replace `exports.* = ...;` with `module.exports.* = ...;`
                transformed.replaceAll(/exports\.(.*) = (.*);/g, "module.exports.$1 = $2;");

                if (addDefaultProperty) {
                    // add `module.exports.default = module.exports;`
                    transformed.append(`\nmodule.exports.default = ${matches[2] as string};`);
                }

                let newCode = transformed.toString();

                // @see https://github.com/Rich-Harris/magic-string/issues/208 why this is needed
                // replace `exports.default = ...; or exports['default'] = ...;` with `module.exports = ...;`
                newCode = newCode.replace(/(?:module\.)?exports(?:\['default'\]|\.default)/i, "module.exports");

                logger.debug({
                    message: `Applied CommonJS interop to entry chunk ${chunk.fileName}.`,
                    prefix: "plugin:cjs-interop",
                });

                return {
                    code: newCode,
                    map: transformed.generateMap({ hires: true }),
                };
            }

            /**
             * JavaScript syntax      Type declaration syntax
             * module.exports = x     export = x
             * exports.default = x;   exports.__esModule = true	export default x
             * export default x       export default x
             * @see https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseExportDefault.md
             */
            if (options.format === "es" && /\.d\.(?:ts|cts)$/.test(chunk.fileName)) {
                if (type !== "commonjs" && chunk.fileName.endsWith(".d.mts")) {
                    return undefined;
                }

                return patchCjsDefaultExport(code);
            }

            return undefined;
        },
    };
};
