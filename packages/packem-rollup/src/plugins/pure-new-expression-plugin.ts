import type { Node } from "estree";
// eslint-disable-next-line import/no-extraneous-dependencies
import { walk } from "estree-walker";
import MagicString from "magic-string";
import type { Plugin } from "rollup";

interface NewExpressionWithRollupExtras {
    callee?: { name?: string; type?: string };
    rollupAnnotations?: { type: string }[];
    start?: number;
    type?: string;
}

/**
 * A Rollup plugin that adds `/*@__PURE__*\/` annotations before `new Constructor(...)` expressions
 * for a given list of constructor names. This allows tree-shaking of unused instantiations.
 *
 * `rollup-plugin-pure` only handles `CallExpression` nodes; this plugin handles `NewExpression`.
 */
// eslint-disable-next-line import/prefer-default-export -- public API surface stays named for plugin consumers
export const pureNewExpressionPlugin = (options: { constructors: string[]; sourcemap?: boolean }): Plugin => {
    const constructorSet = new Set(options.constructors.filter((c) => !c.includes(".")));

    return {
        name: "packem:pure-new-expression",
        transform: {
            handler(code: string) {
                if (constructorSet.size === 0) {
                    return undefined;
                }

                // Quick check — skip if none of the constructor names appear in the code
                let hasAny = false;

                for (const constructor of constructorSet) {
                    if (code.includes(constructor)) {
                        hasAny = true;
                        break;
                    }
                }

                if (!hasAny) {
                    return undefined;
                }

                let ast: Node | undefined;

                try {
                    ast = this.parse(code);
                } catch {
                    return undefined;
                }

                const s = new MagicString(code);

                walk(ast, {
                    enter(rawNode) {
                        const node = rawNode as unknown as NewExpressionWithRollupExtras;
                        const calleeName = node.callee?.name;
                        // eslint-disable-next-line no-underscore-dangle -- `_rollupAnnotations` is rollup's extended ast property name
                        const annotations = (rawNode as unknown as { _rollupAnnotations?: { type: string }[] })._rollupAnnotations;

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
                        }
                    },
                });

                const transformed = s.toString();

                if (transformed === code) {
                    return undefined;
                }

                return {
                    code: transformed,
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
