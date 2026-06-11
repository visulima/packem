import type { Node } from "estree";
// eslint-disable-next-line import/no-extraneous-dependencies
import { walk } from "estree-walker";
import MagicString from "magic-string";
import type { Plugin } from "rollup";

interface NewExpressionWithRollupExtras {

    _rollupAnnotations?: { type: string }[];
    callee?: { name?: string; type?: string };
    rollupAnnotations?: { type: string }[];
    start?: number;
    type?: string;
}

interface CalleeNode {
    computed?: boolean;
    name?: string;
    object?: CalleeNode;
    property?: CalleeNode;
    type?: string;
}

const PURE_LOOKBEHIND = 24;

/**
 * Resolve a (member) callee to its dotted source name, e.g. `Symbol`,
 * `Object.defineProperty`, `Math.floor`. Returns undefined for dynamic / computed
 * callees that can't be matched against the configured name list.
 */
const calleeToName = (callee: CalleeNode | undefined): string | undefined => {
    if (!callee) {
        return undefined;
    }

    if (callee.type === "Identifier") {
        return callee.name;
    }

    if (callee.type === "MemberExpression" && !callee.computed && callee.property?.type === "Identifier") {
        const object = calleeToName(callee.object);

        return object === undefined ? undefined : `${object}.${callee.property.name}`;
    }

    return undefined;
};

/** True when the code immediately before `start` already carries a PURE annotation. */
const isAlreadyPure = (code: string, start: number): boolean => code.slice(Math.max(0, start - PURE_LOOKBEHIND), start).includes("__PURE__");

/**
 * A plugin that adds `/* @__PURE__ * /` annotations so consumers can tree-shake
 * unused calls/instantiations.
 *
 * Two modes, because rolldown and rollup expose pure-annotation timing differently:
 * - `"transform"` (rollup, default): annotates `new Constructor(...)`
 *   (`NewExpression`) only — `rollup-plugin-pure` handles the `CallExpression`
 *   side separately. Runs `order: "post"` so `this.parse` sees transpiled JS.
 * - `"renderChunk"` (rolldown): `rollup-plugin-pure` is transform-only and can't
 *   run under rolldown (its native oxc transform runs after plugin transforms),
 *   so this single renderChunk pass annotates BOTH `NewExpression` (constructors)
 *   and `CallExpression` (functions) on the final transpiled chunk.
 */
// eslint-disable-next-line import/prefer-default-export -- public API surface stays named for plugin consumers
export const pureNewExpressionPlugin = (options: {
    constructors: string[];
    functions?: (RegExp | string)[];
    logger?: Console;
    mode?: "renderChunk" | "transform";
    sourcemap?: boolean;
}): Plugin => {
    // Dotted constructor names (`Foo.Bar`) and RegExp function/constructor entries
    // are not supported by the AST name-comparison used here (only the
    // transform-time `rollup-plugin-pure` handles RegExp). Warn once so a user
    // whose config is partially ignored can diagnose it, then drop them.
    const droppedConstructors = options.constructors.filter((c) => c.includes("."));
    const droppedFunctions = (options.functions ?? []).filter((f) => f instanceof RegExp);

    if ((droppedConstructors.length > 0 || droppedFunctions.length > 0) && options.logger) {
        options.logger.warn({
            message: `ignoring unsupported entries — dotted constructor names (${droppedConstructors.join(", ") || "none"}) and ${String(droppedFunctions.length)} RegExp function/constructor matchers are not supported and were skipped.`,
            prefix: "plugin:pure-new-expression",
        });
    }

    const constructorSet = new Set(options.constructors.filter((c) => !c.includes(".")));
    // Only string function names are matchable by the dotted-name comparison; the
    // RegExp variants `rollup-plugin-pure` accepts are out of scope for the
    // rolldown renderChunk path.
    const functionSet = new Set((options.functions ?? []).filter((f): f is string => typeof f === "string"));

    const escapeForRegExp = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

    // Quick-check tokens: constructor names plus the FIRST segment of each function
    // name (e.g. `Object` for `Object.defineProperty`). If none appear in the
    // source, there is nothing to annotate and we can skip the parse entirely.
    const quickTokens = new Set<string>(constructorSet);

    for (const fn of functionSet) {
        quickTokens.add(fn.split(".")[0] as string);
    }

    const quickCheckRegExp
        = quickTokens.size > 0 ? new RegExp(String.raw`\b(?:${[...quickTokens].map((value) => escapeForRegExp(value)).join("|")})\b`) : undefined;

    if (options.mode === "renderChunk") {
        return {
            name: "packem:pure-new-expression",
            renderChunk: {
                handler(code: string, _chunk, { sourcemap }) {
                    if (quickCheckRegExp === undefined || !quickCheckRegExp.test(code)) {
                        return undefined;
                    }

                    let ast: Node | undefined;

                    try {
                        ast = this.parse(code);
                    } catch {
                        return undefined;
                    }

                    const magicString = new MagicString(code);
                    let changed = false;

                    walk(ast, {
                        enter(rawNode, parent) {
                            const node = rawNode as unknown as NewExpressionWithRollupExtras & { callee?: CalleeNode };

                            if (typeof node.start !== "number") {
                                return;
                            }

                            // Only annotate value-producing expressions. A call/new
                            // whose parent is an ExpressionStatement has its result
                            // discarded — a PURE annotation there says "remove if the
                            // result is unused", i.e. always remove, which is wrong for
                            // side-effectful statements. Crucially this protects the
                            // bundler-generated CJS interop
                            // (`Object.defineProperty(exports, Symbol.toStringTag, …)`),
                            // which a transform-time pure plugin never sees but this
                            // renderChunk pass does — annotating it would make DCE strip
                            // the module's `Symbol.toStringTag` tag.
                            if ((parent as { type?: string } | null)?.type === "ExpressionStatement") {
                                return;
                            }

                            let matched = false;

                            if (node.type === "NewExpression" && node.callee?.type === "Identifier" && typeof node.callee.name === "string" && constructorSet.has(node.callee.name)) {
                                matched = true;
                            } else if (node.type === "CallExpression") {
                                const name = calleeToName(node.callee);

                                if (name !== undefined && functionSet.has(name)) {
                                    matched = true;
                                }
                            }

                            if (matched && !isAlreadyPure(code, node.start)) {
                                magicString.prependLeft(node.start, "/* @__PURE__ */ ");
                                changed = true;
                            }
                        },
                    });

                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `changed` is mutated inside the walk() callback closure
                    if (!changed) {
                        return undefined;
                    }

                    return {
                        code: magicString.toString(),
                        map: sourcemap ? magicString.generateMap({ hires: true }) : undefined,
                    };
                },
                order: "post",
            },
        };
    }

    return {
        name: "packem:pure-new-expression",
        transform: {
            handler(code: string) {
                if (constructorSet.size === 0 || quickCheckRegExp === undefined) {
                    return undefined;
                }

                // Quick check — skip if none of the constructor names appear in the
                // code (as a whole word). The actual annotation decision is still
                // made on the parsed AST below.
                if (!quickCheckRegExp.test(code)) {
                    return undefined;
                }

                let ast: Node | undefined;

                try {
                    ast = this.parse(code);
                } catch {
                    return undefined;
                }

                const s = new MagicString(code);
                let changed = false;

                walk(ast, {
                    enter(rawNode) {
                        const node = rawNode as unknown as NewExpressionWithRollupExtras;
                        const calleeName = node.callee?.name;
                        // eslint-disable-next-line no-underscore-dangle -- `_rollupAnnotations` is rollup's extended ast property name
                        const annotations = node._rollupAnnotations;

                        if (
                            node.type === "NewExpression"
                            && node.callee?.type === "Identifier"
                            && typeof calleeName === "string"
                            && constructorSet.has(calleeName)
                            // Don't double-annotate if rollup already has a pure annotation
                            && !annotations?.some((annotation) => annotation.type === "pure")
                            && typeof node.start === "number"
                        ) {
                            s.prependLeft(node.start, "/* @__PURE__ */ ");
                            changed = true;
                        }
                    },
                });

                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `changed` is mutated inside the walk() callback closure
                if (!changed) {
                    return undefined;
                }

                return {
                    code: s.toString(),
                    map: options.sourcemap ? s.generateMap({ hires: true }) : undefined,
                };
            },
            // Use "post" order so this runs AFTER TypeScript transformers (esbuild/swc/oxc).
            // If we use "pre", `this.parse()` will fail on TypeScript-specific syntax
            // (type annotations, `as` casts, etc.) before the code is transpiled to plain JS.
            order: "post",
        },
    };
};
