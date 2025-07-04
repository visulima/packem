/**
 * Modified copy of https://github.com/huozhi/rollup-preserve-directives/blob/main/src/index.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/rollup-preserve-directives/graphs/contributors
 */
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Pail } from "@visulima/pail";
import type { Node } from "estree";
import MagicString from "magic-string";
import type { Plugin, SourceMap } from "rollup";

const preserveDirectives = ({
    directiveRegex,
    exclude = [],
    include = [],
    logger,
}: {
    directiveRegex: RegExp;
    exclude?: FilterPattern;
    include?: FilterPattern;
    logger: Pail;
}): Plugin => {
    const directives: Record<string, Set<string>> = {};
    const shebangs: Record<string, string> = {};

    const filter = createFilter(include, exclude);

    return {
        name: "packem:preserve-directives",

        onLog(level, log) {
            if (log.code === "MODULE_LEVEL_DIRECTIVE" && level === "warn") {
                return false;
            }

            return undefined;
        },

        renderChunk: {
            handler(code, chunk, { sourcemap }) {
                const outputDirectives = chunk.moduleIds
                    .map((id) => {
                        if (directives[id]) {
                            return directives[id];
                        }

                        return undefined;
                    })
                    // eslint-disable-next-line unicorn/no-array-reduce
                    .reduce<Set<string>>((accumulator, currentDirectives) => {
                        if (currentDirectives) {
                            currentDirectives.forEach((directive) => {
                                accumulator.add(directive);
                            });
                        }

                        return accumulator;
                    }, new Set<string>());

                const magicString = new MagicString(code);

                if (outputDirectives.size > 0) {
                    logger.debug({
                        message: `directives for chunk "${chunk.fileName}" are preserved.`,
                        prefix: "plugin:preserve-directives",
                    });

                    magicString.prepend(`${[...outputDirectives].map((directive) => `'${directive}';`).join("\n")}\n`);
                }

                let shebang: string | undefined;

                if (chunk.facadeModuleId && typeof shebangs[chunk.facadeModuleId] === "string") {
                    shebang = shebangs[chunk.facadeModuleId];
                }

                if (shebang) {
                    logger.debug({
                        message: `shebang for chunk "${chunk.fileName}" is preserved.`,
                        prefix: "plugin:preserve-directives",
                    });

                    magicString.prepend(`${shebang}\n`);
                }

                // Neither outputDirectives is present, no change is needed
                if (outputDirectives.size === 0 && shebang === undefined) {
                    return undefined;
                }

                return {
                    code: magicString.toString(),
                    map: sourcemap ? magicString.generateMap({ hires: true }) : undefined,
                };
            },
            order: "post",
        },

        // eslint-disable-next-line sonarjs/cognitive-complexity
        transform(code, id): { code: string; map: SourceMap | undefined; meta: { preserveDirectives: { directives: string[]; shebang: string | undefined } } } | undefined {
            if (!filter(id)) {
                return undefined;
            }

            // MagicString's `hasChanged()` is slow, so we track the change manually
            let hasChanged = false;

            const magicString: MagicString = new MagicString(code);

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
            if (code.startsWith("#") && code[1] === "!") {
                let firstNewLineIndex = 0;

                // eslint-disable-next-line @typescript-eslint/naming-convention,no-plusplus
                for (let index = 2, length_ = code.length; index < length_; index++) {
                    const charCode = code.codePointAt(index);

                    if (charCode === 10 || charCode === 13 || charCode === 0x20_28 || charCode === 0x20_29) {
                        firstNewLineIndex = index;
                        break;
                    }
                }

                if (firstNewLineIndex) {
                    shebangs[id] = code.slice(0, firstNewLineIndex);

                    magicString.remove(0, firstNewLineIndex + 1);
                    hasChanged = true;

                    logger.debug({
                        message: `shebang for module "${id}" is preserved.`,
                        prefix: "plugin:preserve-directives",
                    });
                }
            }

            /**
             * rollup's built-in parser returns an extended version of ESTree Node.
             */
            let ast: Node | undefined;

            try {
                ast = this.parse(magicString.toString(), { allowReturnOutsideFunction: true }) as Node;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                this.warn({
                    code: "PARSE_ERROR",
                    message: `failed to parse "${id}" and extract the directives.`,
                });

                logger.warn(error);

                return undefined;
            }

            // Exit if the root of the AST is not a Program
            if (ast.type !== "Program") {
                return undefined;
            }

            for (const node of ast.body.filter(Boolean)) {
                // Only parse the top level directives, once reached to the first non statement literal node, stop parsing
                if (node.type !== "ExpressionStatement") {
                    break;
                }

                let directive: string | undefined;

                /**
                 * rollup and estree defines `directive` field on the `ExpressionStatement` node:
                 * https://github.com/rollup/rollup/blob/fecf0cfe14a9d79bb0eff4ad475174ce72775ead/src/ast/nodes/ExpressionStatement.ts#L10
                 */
                if ("directive" in node) {
                    directive = node.directive;
                } else if (node.expression.type === "Literal" && typeof node.expression.value === "string" && directiveRegex.test(node.expression.value)) {
                    directive = node.expression.value;
                }

                if (directive === "use strict") {
                    continue;
                }

                if (directive) {
                    directives[id] ||= new Set<string>();

                    (directives[id] as Set<string>).add(directive);

                    /**
                     * rollup has extended acorn node with the `start` and the `end` field
                     * https://github.com/rollup/rollup/blob/fecf0cfe14a9d79bb0eff4ad475174ce72775ead/src/ast/nodes/shared/Node.ts#L33
                     *
                     * However, typescript doesn't know that, so we add type guards for typescript
                     * to infer.
                     */
                    if ("start" in node && typeof node.start === "number" && "end" in node && typeof node.end === "number") {
                        magicString.remove(node.start, node.end);

                        hasChanged = true;
                    }

                    logger.debug({
                        message: `directive "${directive}" for module "${id}" is preserved.`,
                        prefix: "plugin:preserve-directives",
                    });
                }
            }

            if (!hasChanged) {
                // If nothing has changed, we can avoid the expensive `toString()` and `generateMap()` calls
                return undefined;
            }

            return {
                code: magicString.toString(),
                map: magicString.generateMap({ hires: true }),
                meta: {
                    preserveDirectives: {

                        directives: [...directives[id] ?? []],

                        shebang: shebangs[id] ?? undefined,
                    },
                },
            };
        },
    };
};

export default preserveDirectives;
