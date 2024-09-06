import type { Pail } from "@visulima/pail";
import MagicString from "magic-string";
import type { NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput } from "rollup";

export interface CJSInteropOptions {
    addDefaultProperty?: boolean;
}

export const cjsInterop = ({
    addDefaultProperty = false,
    logger,
    type,
}: {
    logger: Pail;
    type: "commonjs" | "module";
} & CJSInteropOptions): Plugin => {
    return {
        name: "packem:cjs-interop",
        renderChunk: async (
            code: string,
            chunk: RenderedChunk,
            options: NormalizedOutputOptions,
        ): Promise<{
            code: string;
            map: SourceMapInput;
            // eslint-disable-next-line sonarjs/cognitive-complexity
        } | null> => {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (chunk.type !== "chunk" || !chunk.isEntry) {
                return null;
            }

            if (options.format === "cjs" && options.exports === "auto") {
                const matches = /(exports(?:\['default'\]|\.default)) = (.*);/i.exec(code);

                if (matches === null || matches.length < 3) {
                    return null;
                }

                const transformed = new MagicString(code);

                // remove `__esModule` marker property
                transformed.replace("Object.defineProperty(exports, '__esModule', { value: true });", "");
                // replace `exports.* = ...;` with `module.exports.* = ...;`
                transformed.replaceAll(/exports\.(.*) = (.*);/g, "module.exports.$1 = $2;");

                if (addDefaultProperty) {
                    // add `module.exports.default = module.exports;`
                    transformed.append("\nmodule.exports.default = " + (matches[2] as string) + ";");
                }

                let newCode = transformed.toString();
                // @see https://github.com/Rich-Harris/magic-string/issues/208 why this is needed
                // replace `exports.default = ...; or exports['default'] = ...;` with `module.exports = ...;`
                newCode = newCode.replace(/(?:module\.)?exports(?:\['default'\]|\.default)/i, "module.exports");

                logger.debug({
                    message: "Applied CommonJS interop to entry chunk " + chunk.fileName + ".",
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
             *
             * @see https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseExportDefault.md
             */
            if (options.format === "es" && /\.d\.(?:ts|cts)$/.test(chunk.fileName)) {
                if (type !== "commonjs" && chunk.fileName.endsWith(".d.mts")) {
                    return null;
                }

                const matches: string[] = [];

                let matchs;
                // will match `export { ... }` statement
                const regex = /export\s\{\s(.*)\s\}/g;

                // eslint-disable-next-line no-loops/no-loops,no-cond-assign
                while ((matchs = regex.exec(code)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (matchs.index === regex.lastIndex) {
                        // eslint-disable-next-line no-plusplus
                        regex.lastIndex++;
                    }

                    matchs.forEach((match) => {
                        matches.push(match);
                    });
                }

                if (matches.length === 0) {
                    return null;
                }

                // we need the last match
                const splitMatches = (matches.at(-1) as string).split(", ");

                let defaultKey = "";

                // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
                for (const match of splitMatches) {
                    if (match.includes("type")) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    if (match.includes("as")) {
                        const [original, alias] = match.split(" as ");

                        if (alias === "default") {
                            defaultKey = original as string;
                        }
                    }
                }

                if (defaultKey !== "") {
                    const dtsTransformed = new MagicString(code);

                    // TODO: adjust regex to remove `export { ... } if its the only entry
                    dtsTransformed.replace(new RegExp(`(,s)?${defaultKey} as default(,)?`), "");
                    dtsTransformed.append("\n\nexport = " + defaultKey + ";");

                    logger.debug({
                        message: "Applied CommonJS interop to entry chunk " + chunk.fileName + ".",
                        prefix: "plugin:cjs-interop",
                    });

                    return {
                        code: dtsTransformed.toString(),
                        map: dtsTransformed.generateMap({ hires: true }),
                    };
                }
            }

            return null;
        },
    };
};
