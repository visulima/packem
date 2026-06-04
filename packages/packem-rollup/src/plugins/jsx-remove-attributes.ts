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

/**
 * Callees emitted by React's automatic runtime. `jsx` is used for single (or no)
 * child, `jsxs` for multiple static children, and `jsxDEV` in development. They
 * all carry the same props object as the second argument, so attribute stripping
 * must cover all three.
 *
 * Ordering note: this plugin relies on running AFTER the JSX transformer, so the
 * per-module source contains bare `jsx(`/`jsxs(`/`jsxDEV(` identifier callees
 * (not `jsxRuntime.jsx`). Only the automatic runtime is supported; the classic
 * runtime (`React.createElement`) is intentionally out of scope.
 */
const AUTOMATIC_RUNTIME_CALLEES = new Set(["jsx", "jsxDEV", "jsxs"]);

export type JSXRemoveAttributesPlugin = {
    attributes: string[];
};

export const jsxRemoveAttributes = ({ attributes, logger }: JSXRemoveAttributesPlugin & { logger: Console }): Plugin => {
    if (!Array.isArray(attributes) || attributes.length === 0) {
        throw new Error("[packem:jsx-remove-attributes]: attributes must be a non-empty array of strings.");
    }

    return {
        name: "packem:jsx-remove-attributes",
        transform: {
            filter: {
                id: JSX_FILE_RE,
            },
            handler(code: string, id: string) {
                /**
                 * rollup's built-in parser returns an extended version of ESTree Node.
                 */
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

                const magicString: MagicString = new MagicString(code);

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
                                        // -2 to remove the comma and the space before the property
                                        magicString.overwrite((property as PropertyLiteralValue).start - 2, (property as PropertyLiteralValue).end, "");
                                    }
                                }
                            }
                        }
                    },
                });

                const transformed = magicString.toString();

                if (transformed === code) {
                    return undefined;
                }

                return { code: transformed, map: magicString.generateMap({ hires: true }) };
            },
        },
    };
};
