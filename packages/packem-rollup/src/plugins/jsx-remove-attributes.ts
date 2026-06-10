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

export type JSXRemoveAttributesPlugin = {
    attributes: string[];
};

/**
 * Walk an already-parsed program and strip the configured attributes from every
 * automatic-runtime JSX call's props object. Returns a `MagicString` only when an
 * edit was made (so callers can skip serialization on a no-op).
 *
 * `trailingComma` selects how the property + its separating comma are removed:
 * - `false` (rollup transform): the per-module source is the transformer's
 *   single-line output (`{ a: 1, "x": 2 }`), so the leading `, ` is removed —
 *   byte-identical to the long-standing behavior.
 * - `true` (rolldown renderChunk): the emitted chunk is rolldown's formatted
 *   output, where props are multi-line WITH trailing commas
 *   (`{\n  a: 1,\n  "x": 2,\n}`). Removing the leading `, ` there would leave a
 *   dangling comma (`,,`) and produce invalid JS; instead remove the property and
 *   its own trailing comma.
 */
const stripAttributes = (ast: Node, code: string, attributes: string[], trailingComma: boolean): MagicString | undefined => {
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
                        if (
                            property.type === "Property"
                            && property.key.type === "Literal"
                            && property.value.type === "Literal"
                            && attributes.includes(property.key.value as string)
                        ) {
                            const { end, start } = property as PropertyLiteralValue;

                            if (trailingComma) {
                                // Remove the property, then consume any whitespace + one
                                // trailing comma after it.
                                let removeEnd = end;

                                while (removeEnd < code.length && WHITESPACE_RE.test(code[removeEnd] as string)) {
                                    removeEnd += 1;
                                }

                                if (code[removeEnd] === ",") {
                                    removeEnd += 1;
                                }

                                magicString.remove(start, removeEnd);
                            } else {
                                // -2 to remove the comma and the space before the property
                                magicString.overwrite(start - 2, end, "");
                            }

                            changed = true;
                        }
                    }
                }
            }
        },
    });

    return changed ? magicString : undefined;
};

/**
 * Remove JSX attributes (e.g. `data-testid`) from automatic-runtime JSX calls.
 *
 * Two modes, because the bundlers run their JSX transform at different times:
 * - `"transform"` (rollup): packem's transformer adapter runs as an earlier
 *   transform plugin, so by the time this transform hook runs the per-module
 *   source already contains `jsx(...)` calls and `this.parse` sees plain JS.
 * - `"renderChunk"` (rolldown): rolldown's native oxc transform runs AFTER
 *   plugin transform hooks, so a transform hook would see raw JSX and
 *   `this.parse` would throw. The emitted chunk, however, is fully transpiled —
 *   so the same AST walk runs there instead.
 */
export const jsxRemoveAttributes = ({
    attributes,
    logger,
    mode = "transform",
}: JSXRemoveAttributesPlugin & { logger: Console; mode?: "renderChunk" | "transform" }): Plugin => {
    if (!Array.isArray(attributes) || attributes.length === 0) {
        throw new Error("[packem:jsx-remove-attributes]: attributes must be a non-empty array of strings.");
    }

    if (mode === "renderChunk") {
        return {
            name: "packem:jsx-remove-attributes",
            renderChunk: {
                handler(code: string, chunk, { sourcemap }) {
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

                    const magicString = stripAttributes(ast, code, attributes, true);

                    if (magicString === undefined) {
                        return undefined;
                    }

                    return { code: magicString.toString(), map: sourcemap ? magicString.generateMap({ hires: true }) : undefined };
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

                const magicString = stripAttributes(ast, code, attributes, false);

                if (magicString === undefined) {
                    return undefined;
                }

                return { code: magicString.toString(), map: magicString.generateMap({ hires: true }) };
            },
        },
    };
};
