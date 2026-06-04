import MagicString from "magic-string";
import type { NormalizedOutputOptions, Plugin, RenderedChunk, SourceMapInput } from "rollup";

const EXPORTS_DEFAULT_ASSIGNMENT_RE = /(exports(?:\['default'\]|\.default)) = (.*);/i;

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

                // Rewrite every `exports.<name> = ...;` assignment. The default
                // export is special-cased to collapse straight to `module.exports`
                // (@see https://github.com/Rich-Harris/magic-string/issues/208).
                //
                // All edits are performed through MagicString (overwriting the
                // matched LHS token on the original code) so the generated
                // sourcemap stays aligned with the emitted code. We intentionally
                // do NOT do a post-`toString()` string replace, which would leave
                // the map describing the pre-replace text.
                const EXPORTS_ASSIGNMENT_RE = /exports(?:\['default'\]|\.([A-Za-z_$][\w$]*)) = /g;

                let assignmentMatch: RegExpExecArray | null = EXPORTS_ASSIGNMENT_RE.exec(code);

                while (assignmentMatch !== null) {
                    const tokenStart = assignmentMatch.index;
                    // The matched token is `exports.<name>` / `exports['default']`,
                    // i.e. everything before the ` = ` suffix (length 3).
                    const tokenEnd = tokenStart + assignmentMatch[0].length - 3;
                    const name = assignmentMatch[1];

                    if (name === undefined || name === "default") {
                        // `exports['default']` or `exports.default` -> `module.exports`
                        transformed.overwrite(tokenStart, tokenEnd, "module.exports");
                    } else {
                        // `exports.<name>` -> `module.exports.<name>`
                        transformed.overwrite(tokenStart, tokenEnd, `module.exports.${name}`);
                    }

                    assignmentMatch = EXPORTS_ASSIGNMENT_RE.exec(code);
                }

                if (addDefaultProperty) {
                    // add `module.exports.default = module.exports;`
                    transformed.append(`\nmodule.exports.default = ${matches[2] as string};`);
                }

                logger.debug({
                    message: `Applied CommonJS interop to entry chunk ${chunk.fileName}.`,
                    prefix: "plugin:cjs-interop",
                });

                return {
                    code: transformed.toString(),
                    map: transformed.generateMap({ hires: true }),
                };
            }

            return undefined;
        },
    };
};
