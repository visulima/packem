/**
 * Modified copy of https://github.com/huozhi/rollup-preserve-directives/blob/main/src/index.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/rollup-preserve-directives/graphs/contributors
 */
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
// rollup 4.63 types its own `SourceMap.sourcesContent` as `(string | null)[]` while
// `SourceMapInput` still demands `string[]`, so rollup's map type no longer satisfies
// the hooks that return it. magic-string's map is what we actually produce here.
import type { SourceMap } from "magic-string";
import MagicString from "magic-string";
import type { Plugin } from "rollup";

type PreserveDirectivesPluginOptions = {
    directiveRegex: RegExp;
    exclude?: FilterPattern;
    include?: FilterPattern;
    logger: Console;
};

interface ScannedDirective {
    /** Index just past the statement (after the terminating `;`, or after the closing quote on ASI) — matches estree's ExpressionStatement.end. */
    end: number;
    /** Index of the opening quote — matches estree's ExpressionStatement.start. */
    start: number;
    /** Directive text without the surrounding quotes (e.g. `use client`). */
    value: string;
}

// Spelled with explicit escapes (not raw characters) so the set is reviewable
// by eye: space, tab, form-feed, vertical-tab, no-break space, BOM.
const WHITESPACE = new Set([" ", "\t", "\f", "\v", "\u{A0}", "\u{FEFF}"]);
// Line feed, carriage return, line separator (U+2028), paragraph separator (U+2029).
const LINE_TERMINATORS = new Set(["\n", "\r", "\u{2028}", "\u{2029}"]);

// Extracts the first quoted token from a rollup MODULE_LEVEL_DIRECTIVE warning
// message (the offending directive, e.g. `"use client"`). Module-scoped to avoid
// recompiling on every `onLog` call.
const MODULE_LEVEL_DIRECTIVE_MESSAGE_RE = /"([^"]*)"|'([^']*)'/;

/**
 * Extract a module's leading Directive Prologue WITHOUT a full parse.
 *
 * preserve-directives has to run under rolldown too, where the native oxc
 * transform runs AFTER plugin `transform` hooks — so `this.parse()` here would
 * see un-transpiled TS/JSX and throw. The Directive Prologue (and the shebang,
 * handled separately by the caller) always precedes any TS/JSX-specific syntax,
 * so a lightweight scan of just the prologue is both sufficient and
 * backend-agnostic.
 *
 * Mirrors acorn/estree semantics so the rollup output stays byte-identical to
 * the previous AST-based removal: the prologue is the leading run of
 * ExpressionStatements whose expression is a single string literal, with
 * whitespace and comments allowed before/between them; the returned spans match
 * estree's ExpressionStatement `start`/`end` (start at the opening quote, end
 * after the terminating `;` when present, otherwise after the closing quote).
 */
// Intricate single-pass prologue scanner; splitting it would obscure the
// byte-identical span semantics it deliberately mirrors from estree.
// eslint-disable-next-line sonarjs/cognitive-complexity
const scanLeadingDirectives = (code: string): ScannedDirective[] => {
    const directives: ScannedDirective[] = [];
    const { length } = code;
    let index = 0;

    // Advance past whitespace and comments. When `allowNewlines` is false the
    // scan stops at the first line terminator (used to find a same-line
    // statement terminator after a string literal).
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const skipTrivia = (allowNewlines: boolean): void => {
        while (index < length) {
            const char = code[index] as string;

            if (WHITESPACE.has(char)) {
                index += 1;
            } else if (LINE_TERMINATORS.has(char)) {
                if (!allowNewlines) {
                    return;
                }

                index += 1;
            } else if (char === "/" && code[index + 1] === "/") {
                index += 2;

                while (index < length && !LINE_TERMINATORS.has(code[index] as string)) {
                    index += 1;
                }
            } else if (char === "/" && code[index + 1] === "*") {
                index += 2;

                while (index < length && !(code[index] === "*" && code[index + 1] === "/")) {
                    index += 1;
                }

                index += 2; // consume the closing `*/`
            } else {
                return;
            }
        }
    };

    while (index < length) {
        skipTrivia(true);

        if (index >= length) {
            break;
        }

        const quote = code[index];

        if (quote !== '"' && quote !== "'") {
            break; // first non-string statement ends the prologue
        }

        const stringStart = index;

        index += 1;

        let isClosed = false;

        while (index < length) {
            const char = code[index] as string;

            if (char === "\\") {
                index += 2; // skip the escaped character
                continue;
            }

            if (char === quote) {
                index += 1;
                isClosed = true;
                break;
            }

            if (LINE_TERMINATORS.has(char)) {
                break; // an unterminated string literal is not a directive
            }

            index += 1;
        }

        if (!isClosed) {
            break;
        }

        const stringEnd = index; // just past the closing quote
        const value = code.slice(stringStart + 1, stringEnd - 1);

        // Find the statement terminator on the same line.
        skipTrivia(false);

        const terminator = code[index];

        if (terminator === ";") {
            index += 1; // estree's ExpressionStatement.end includes the semicolon

            directives.push({ end: index, start: stringStart, value });

            continue;
        }

        if (index >= length || LINE_TERMINATORS.has(terminator as string) || terminator === "}") {
            // ASI: the statement ends at the closing quote; no semicolon consumed.
            directives.push({ end: stringEnd, start: stringStart, value });

            continue;
        }

        // The string continues a larger expression (e.g. `"a" + "b"`,
        // `"x".length`) — it is not a directive and the prologue ends here.
        break;
    }

    return directives;
};

export const preserveDirectivesPlugin = ({ directiveRegex, exclude = [], include = [], logger }: PreserveDirectivesPluginOptions): Plugin => {
    const directives: Record<string, Set<string>> = {};
    const shebangs: Record<string, string> = {};

    const filter = createFilter(include, exclude);

    return {
        name: "packem:preserve-directives",

        onLog(level, log) {
            // Only suppress the warning for directives this plugin actually
            // preserves (matches `directiveRegex`). Other module-level directives
            // are left to warn as usual so the user still hears about them.
            if (log.code === "MODULE_LEVEL_DIRECTIVE" && level === "warn") {
                const match = MODULE_LEVEL_DIRECTIVE_MESSAGE_RE.exec(log.message);
                const directive = match?.[1] ?? match?.[2];

                if (directive !== undefined && directiveRegex.test(`"${directive}"`)) {
                    return false;
                }
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
                    const metaDirectives = (this.getModuleInfo(id)?.meta as { preserveDirectives?: { directives?: string[] } } | undefined)?.preserveDirectives
                        ?.directives;

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

                // Defensive dedup: if the emitted chunk already carries a leading
                // directive (e.g. a bundler that re-emits it natively), don't
                // prepend a duplicate. Under both backends `transform` strips the
                // source directive so this is normally a no-op, but it guards
                // against rolldown's native directive emission re-introducing one.
                for (const { value } of scanLeadingDirectives(code)) {
                    outputDirectives.delete(value);
                }

                if (outputDirectives.size > 0) {
                    logger.debug({
                        message: `directives for chunk "${chunk.fileName}" are preserved.`,
                        prefix: "plugin:preserve-directives",
                    });

                    // Emit each directive as a single-quoted string literal to match
                    // the ecosystem convention (`'use client';`). Backslashes and
                    // single quotes are escaped so a directive value containing them
                    // cannot break out of the literal and inject statements.
                    magicString.prepend(
                        `${Array.from(outputDirectives, (directive) => `'${directive.replaceAll("\\", String.raw`\\`).replaceAll("'", String.raw`\'`)}';`).join("\n")}\n`,
                    );
                }

                let shebang: string | undefined;

                if (chunk.facadeModuleId) {
                    // Same cache-hit concern as directives above: prefer the
                    // persisted `meta` shebang, fall back to the side-channel.
                    const metaShebang = (this.getModuleInfo(chunk.facadeModuleId)?.meta as { preserveDirectives?: { shebang?: string } } | undefined)
                        ?.preserveDirectives?.shebang;

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

            // Reset any state recorded for this id on a previous (watch) run.
            // Without this, a directive/shebang removed from the source between
            // rebuilds would keep being re-emitted, and the closure records would
            // grow unboundedly across rebuilds.
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete directives[id];
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete shebangs[id];

            // MagicString's `hasChanged()` is slow, so we track the change manually
            let hasChanged = false;

            // Allocate MagicString lazily — only once we know there is an edit to
            // make. Most modules have neither a shebang nor a directive prologue,
            // so the common path avoids the allocation entirely.
            let magicString: MagicString | undefined;

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

                    magicString = new MagicString(code);

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

            // Scan the leading Directive Prologue without a full parse so this
            // runs under rolldown too (see scanLeadingDirectives). Scanning the
            // post-shebang-removal source keeps the spans aligned with the
            // `magicString` coordinates used by `remove()` below. When no shebang
            // was stripped, the source is unchanged so we scan `code` directly and
            // skip materializing the MagicString.
            const scanSource = magicString === undefined ? code : magicString.toString();

            for (const { end, start, value } of scanLeadingDirectives(scanSource)) {
                // `"use strict"` is left untouched: the bundler manages strict-mode
                // emission per format, so it is neither hoisted nor stripped here.
                if (value === "use strict") {
                    continue;
                }

                // Only hoist real `use <word>` directives. The previous AST path
                // relied on acorn's per-statement `directive` field; the regex is
                // reconstructed with quotes because it anchors on them.
                if (!directiveRegex.test(`"${value}"`)) {
                    continue;
                }

                const existing = directives[id];

                if (existing) {
                    existing.add(value);
                } else {
                    directives[id] = new Set<string>([value]);
                }

                magicString ??= new MagicString(code);
                magicString.remove(start, end);

                hasChanged = true;

                logger.debug({
                    message: `directive "${value}" for module "${id}" is preserved.`,
                    prefix: "plugin:preserve-directives",
                });
            }

            // `magicString` is only allocated when an edit was made, so it is
            // defined exactly when `hasChanged` is true; the explicit check also
            // narrows the type for the return below.
            if (!hasChanged || magicString === undefined) {
                // If nothing has changed, we can avoid the expensive `toString()` and `generateMap()` calls
                return undefined;
            }

            return {
                code: magicString.toString(),
                map: magicString.generateMap({ hires: true }),
                meta: {
                    preserveDirectives: {
                        directives: [...(directives[id] ?? [])],

                        shebang: shebangs[id] ?? undefined,
                    },
                },
            };
        },
    };
};

export type { PreserveDirectivesPluginOptions };
