import type { Node, ObjectExpression, Property } from "estree";
// eslint-disable-next-line import/no-extraneous-dependencies
import { walk } from "estree-walker";
import MagicString from "magic-string";
import type { Plugin } from "rollup";

interface PropertyLiteralValue extends Property {
    end: number;
    key: {
        type: "Literal";
        value: string;
    };
    start: number;
    type: "Property";
    value: {
        type: "Literal";
        value: string;
    };
}

const JSX_FILE_RE = /\.[jt]sx$/;
const WHITESPACE_RE = /\s/;

/**
 * Callees emitted by React's automatic runtime. `jsx` is used for single (or no)
 * child, `jsxs` for multiple static children, and `jsxDEV` in development. They
 * all carry the same props object as the second argument, so attribute stripping
 * must cover all three.
 *
 * Ordering note: this relies on running AFTER the JSX transformer, so the source
 * contains bare `jsx(`/`jsxs(`/`jsxDEV(` identifier callees (not
 * `jsxRuntime.jsx`). Only the automatic runtime is supported; the classic runtime
 * (`React.createElement`) is intentionally out of scope.
 */
const AUTOMATIC_RUNTIME_CALLEES = new Set(["jsx", "jsxDEV", "jsxs"]);

type JSXRemoveAttributesPlugin = {
    attributes: string[];
};

// Starting at `end`, skip any whitespace and, if the next non-whitespace
// character is a comma, consume it too. Returns the offset just past the
// property's own trailing comma (or just past the trailing whitespace when the
// property is last and has none).
const scanPastTrailingComma = (code: string, end: number): number => {
    let removeEnd = end;

    while (removeEnd < code.length && WHITESPACE_RE.test(code[removeEnd] as string)) {
        removeEnd += 1;
    }

    if (code[removeEnd] === ",") {
        removeEnd += 1;
    }

    return removeEnd;
};

// Remove a matched property (and its separating comma) from the props object.
//
// - `trailingComma` (rolldown renderChunk): multi-line props end with a trailing
//   comma, so remove the property plus its own trailing comma + whitespace.
// - otherwise (rollup transform): single-line props. A leading `, ` only
//   precedes the property when it is NOT first; consuming it matches the
//   long-standing behaviour for middle/last props (adjacent stripped props each
//   own their own leading comma, so removals never overlap). When the property
//   IS first (preceded by `{`), consume the trailing comma instead so the
//   opening brace survives — the original `start - 2` deleted it.
const removeProperty = (magicString: MagicString, code: string, start: number, end: number, trailingComma: boolean): void => {
    if (trailingComma) {
        magicString.remove(start, scanPastTrailingComma(code, end));

        return;
    }

    let removeStart = start;

    while (removeStart > 0 && WHITESPACE_RE.test(code[removeStart - 1] as string)) {
        removeStart -= 1;
    }

    if (code[removeStart - 1] === ",") {
        magicString.remove(removeStart - 1, end);

        return;
    }

    magicString.remove(start, scanPastTrailingComma(code, end));
};

/**
 * Walk an already-parsed program and strip the configured attributes from every
 * automatic-runtime JSX call's props object. Returns a `MagicString` only when an
 * edit was made (so callers can skip serialization on a no-op).
 *
 * `trailingComma` selects how the property + its separating comma are removed.
 * `false` (rollup transform): the per-module source is the transformer's
 * single-line output (`{ a: 1, "x": 2 }`), so the leading `, ` is removed —
 * byte-identical to the long-standing behavior.
 * `true` (rolldown renderChunk): the emitted chunk is rolldown's formatted
 * output, where props are multi-line WITH trailing commas
 * (`{\n a: 1,\n "x": 2,\n}`). Removing the leading `, ` there would leave a
 * dangling comma (`,,`) and produce invalid JS; instead remove the property and
 * its own trailing comma.
 */
const stripAttributes = (ast: Node, code: string, attributes: string[], trailingComma: boolean, logger: Console): MagicString | undefined => {
    const magicString = new MagicString(code);
    let changed = false;

    walk(ast, {
        enter(node) {
            if (node.type === "CallExpression" && node.callee.type === "Identifier" && AUTOMATIC_RUNTIME_CALLEES.has(node.callee.name)) {
                const filteredArguments = node.arguments.filter(
                    (argument): argument is ObjectExpression => argument.type === "ObjectExpression" && Array.isArray(argument.properties),
                );

                for (const object of filteredArguments) {
                    for (const property of object.properties) {
                        if (property.type !== "Property" || property.key.type !== "Literal" || !attributes.includes(property.key.value as string)) {
                            continue;
                        }

                        if (property.value.type !== "Literal") {
                            // Only statically-literal values are stripped (a dynamic
                            // value may have side effects / be needed at runtime).
                            // Surface the skip so it's diagnosable.
                            logger.debug({
                                message: `skipping attribute "${String(property.key.value)}": value is "${property.value.type}", not a literal.`,
                                prefix: "plugin:jsx-remove-attributes",
                            });

                            continue;
                        }

                        const { end, start } = property as PropertyLiteralValue;

                        removeProperty(magicString, code, start, end, trailingComma);

                        changed = true;
                    }
                }
            }
        },
    });

    // `changed` is flipped to true inside the `walk` callback above. TypeScript's
    // control-flow analysis doesn't model that the closure ran, so it narrows
    // `changed` back to its initial `false` here and the rule misreads the ternary
    // as always-falsy — a known closure-mutation false positive. Runtime is correct.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    return changed ? magicString : undefined;
};

/**
 * Remove JSX attributes (e.g. `data-testid`) from automatic-runtime JSX calls.
 *
 * Two modes, because the bundlers run their JSX transform at different times.
 * `"transform"` (rollup): packem's transformer adapter runs as an earlier
 * transform plugin, so by the time this transform hook runs the per-module
 * source already contains `jsx(...)` calls and `this.parse` sees plain JS.
 * `"renderChunk"` (rolldown): rolldown's native oxc transform runs AFTER
 * plugin transform hooks, so a transform hook would see raw JSX and
 * `this.parse` would throw. The emitted chunk, however, is fully transpiled —
 * so the same AST walk runs there instead.
 */
export const jsxRemoveAttributes = ({
    attributes,
    logger,
    mode = "transform",
    sourcemap = true,
}: JSXRemoveAttributesPlugin & { logger: Console; mode?: "renderChunk" | "transform"; sourcemap?: boolean }): Plugin => {
    if (!Array.isArray(attributes) || attributes.length === 0) {
        throw new Error("[packem:jsx-remove-attributes]: attributes must be a non-empty array of strings.");
    }

    if (mode === "renderChunk") {
        return {
            name: "packem:jsx-remove-attributes",
            renderChunk: {
                handler(code: string, chunk, { sourcemap: chunkSourcemap }) {
                    // Cheap pre-check: a chunk can only contain a strippable
                    // attribute if it also contains an automatic-runtime JSX call
                    // AND at least one of the configured attribute names. Skip the
                    // (expensive) full parse otherwise.
                    if (
                        !(code.includes("jsx(") || code.includes("jsxs(") || code.includes("jsxDEV("))
                        || !attributes.some((attribute) => code.includes(attribute))
                    ) {
                        return undefined;
                    }

                    let ast: Node | undefined;

                    try {
                        ast = this.parse(code, { allowReturnOutsideFunction: true });
                    } catch (error) {
                        this.warn({
                            code: "PARSE_ERROR",
                            message: `[packem:jsx-remove-attributes]: failed to parse chunk "${chunk.fileName}" and remove the jsx attribute.`,
                        });

                        logger.warn(error);

                        return undefined;
                    }

                    const magicString = stripAttributes(ast, code, attributes, true, logger);

                    if (magicString === undefined) {
                        return undefined;
                    }

                    return { code: magicString.toString(), map: chunkSourcemap ? magicString.generateMap({ hires: true }) : undefined };
                },
                // Run after other renderChunk transforms so we operate on the final
                // transpiled chunk shape.
                order: "post",
            },
        };
    }

    return {
        name: "packem:jsx-remove-attributes",
        transform: {
            filter: {
                id: JSX_FILE_RE,
            },
            handler(code: string, id: string) {
                let ast: Node | undefined;

                try {
                    ast = this.parse(code, { allowReturnOutsideFunction: true });
                } catch (error) {
                    this.warn({
                        code: "PARSE_ERROR",
                        message: `[packem:jsx-remove-attributes]: failed to parse "${id}" and remove the jsx attribute.`,
                    });

                    logger.warn(error);

                    return undefined;
                }

                const magicString = stripAttributes(ast, code, attributes, false, logger);

                if (magicString === undefined) {
                    return undefined;
                }

                return { code: magicString.toString(), map: sourcemap ? magicString.generateMap({ hires: true }) : undefined };
            },
        },
    };
};

export type { JSXRemoveAttributesPlugin };
