import MagicString from "magic-string";
import type { NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput } from "rollup";

const EXPORTS_DEFAULT_ASSIGNMENT_RE = /(exports(?:\['default'\]|\.default)) = (.*);/i;
const EXPORTS_DEFAULT_RE = /(?:module\.)?exports(?:\['default'\]|\.default)/i;

export interface CJSInteropOptions {
    addDefaultProperty?: boolean;
}

export const cjsInteropPlugin = ({
    addDefaultProperty = false,
    logger,
}: CJSInteropOptions & {
    logger: Console;
}): Plugin => {
    return {
        name: "packem:cjs-interop",
        renderChunk: (
            code: string,
            chunk: RenderedChunk,
            options: NormalizedOutputOptions,
        ):
            | {
                code: string;
                map: SourceMapInput;
            }
            | undefined => {
            if (!chunk.isEntry) {
                return undefined;
            }

            if (options.format === "cjs" && options.exports === "auto") {
                const matches = EXPORTS_DEFAULT_ASSIGNMENT_RE.exec(code);

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
                newCode = newCode.replace(EXPORTS_DEFAULT_RE, "module.exports");

                logger.debug({
                    message: `Applied CommonJS interop to entry chunk ${chunk.fileName}.`,
                    prefix: "plugin:cjs-interop",
                });

                return {
                    code: newCode,
                    map: transformed.generateMap({ hires: true }),
                };
            }

            return undefined;
        },
    };
};
