/**
 * Modified copy of https://github.com/huozhi/rollup-preserve-directives/blob/main/src/index.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/rollup-preserve-directives/graphs/contributors
 */
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Node } from "estree";
import MagicString from "magic-string";
import type { Plugin, SourceMap } from "rollup";

export type PreserveDirectivesPluginOptions = {
    directiveRegex: RegExp;
    exclude?: FilterPattern;
    include?: FilterPattern;
    logger: Console;
};

export const preserveDirectivesPlugin = ({ directiveRegex, exclude = [], include = [], logger }: PreserveDirectivesPluginOptions): Plugin => {
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
                // Resolve a module's directives, preferring the persisted `meta`
                // over the in-memory `directives` side-channel. The side-channel
                // is only populated when this plugin's `transform` actually runs;
                // on a warm rebuild where the build cache serves a `transform`
                // cache hit, the real handler is skipped and the side-channel
                // stays empty — but `meta.preserveDirectives` is restored from the
                // cached transform result and is available via `getModuleInfo`.
                // Reading `meta` first keeps directive hoisting correct across
                // incremental, cache-hit rebuilds (otherwise an unchanged module
                // silently loses its `"use client"`/`"use server"` banner).
                const directivesForId = (id: string): Set<string> | undefined => {
                    const metaDirectives = (this.getModuleInfo(id)?.meta as { preserveDirectives?: { directives?: string[] } } | undefined)?.preserveDirectives?.directives;

                    if (metaDirectives && metaDirectives.length > 0) {
                        return new Set<string>(metaDirectives);
                    }

                    return directives[id];
                };

                const outputDirectives = chunk.moduleIds
                    .map((id) => directivesForId(id))
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

                    magicString.prepend(`${Array.from(outputDirectives, (directive) => `'${directive}';`).join("\n")}\n`);
                }

                let shebang: string | undefined;

                if (chunk.facadeModuleId) {
                    // Same cache-hit concern as directives above: prefer the
                    // persisted `meta` shebang, fall back to the side-channel.
                    const metaShebang = (this.getModuleInfo(chunk.facadeModuleId)?.meta as { preserveDirectives?: { shebang?: string } } | undefined)
                        ?.preserveDirectives
                        ?.shebang;

                    if (typeof metaShebang === "string") {
                        shebang = metaShebang;
                    } else if (typeof shebangs[chunk.facadeModuleId] === "string") {
                        shebang = shebangs[chunk.facadeModuleId];
                    }
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
        transform(
            code,
            id,
        ): { code: string; map: SourceMap | undefined; meta: { preserveDirectives: { directives: string[]; shebang: string | undefined } } } | undefined {
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
             * Those assumptions are also made by acorn, babel and swc; see their parser sources for confirmation.
             */
            if (code.startsWith("#") && code[1] === "!") {
                // Default to end-of-file so a shebang-only file with no trailing
                // newline (e.g. `#!/usr/bin/env node` followed by EOF) is still
                // captured and stripped rather than silently lost.
                let firstNewLineIndex = code.length;

                for (let codeLength = code.length, index = 2; index < codeLength; index += 1) {
                    const charCode = code.codePointAt(index);

                    if (charCode === 10 || charCode === 13 || charCode === 0x20_28 || charCode === 0x20_29) {
                        firstNewLineIndex = index;
                        break;
                    }
                }

                if (firstNewLineIndex > 0) {
                    shebangs[id] = code.slice(0, firstNewLineIndex);

                    // Clamp so we never remove past the end of the source when no
                    // line terminator was found.
                    magicString.remove(0, Math.min(firstNewLineIndex + 1, code.length));
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
                ast = this.parse(magicString.toString(), { allowReturnOutsideFunction: true });
            } catch (error) {
                this.warn({
                    code: "PARSE_ERROR",
                    message: `failed to parse "${id}" and extract the directives.`,
                });

                logger.warn(error);

                return undefined;
            }

            // `ast.type` is typed as the literal "Program" by this.parse, so no runtime check is needed here.

            for (const node of ast.body.filter(Boolean)) {
                // Only parse the top level directives, once reached to the first non statement literal node, stop parsing
                if (node.type !== "ExpressionStatement") {
                    break;
                }

                let directive: string | undefined;

                /**
                 * rollup and estree defines `directive` field on the `ExpressionStatement` node;
                 * see rollup's ExpressionStatement.ts source.
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
                    const existing = directives[id];

                    if (existing) {
                        existing.add(directive);
                    } else {
                        directives[id] = new Set<string>([directive]);
                    }

                    /**
                     * rollup has extended acorn node with the `start` and the `end` field;
                     * see rollup's Node.ts source for the extended shape.
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
