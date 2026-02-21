import type { Node } from "estree";
// eslint-disable-next-line import/no-extraneous-dependencies
import { walk } from "estree-walker";
import MagicString from "magic-string";
import type { Plugin } from "rollup";

/**
 * A Rollup plugin that adds `/*@__PURE__*\/` annotations before `new Constructor(...)` expressions
 * for a given list of constructor names. This allows tree-shaking of unused instantiations.
 *
 * `rollup-plugin-pure` only handles `CallExpression` nodes; this plugin handles `NewExpression`.
 */
export const pureNewExpressionPlugin = (options: { constructors: string[]; sourcemap?: boolean }): Plugin => {
    const constructorSet = new Set(options.constructors.filter((c) => !c.includes(".")));

    return {
        name: "packem:pure-new-expression",
        transform: {
            // Use "post" order so this runs AFTER TypeScript transformers (esbuild/swc/oxc).
            // If we use "pre", `this.parse()` will fail on TypeScript-specific syntax
            // (type annotations, `as` casts, etc.) before the code is transpiled to plain JS.
            order: "post",
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ast = this.parse(code) as any;
                } catch {
                    return undefined;
                }

                const s = new MagicString(code);
                let hasChanges = false;

                walk(ast, {
                    // eslint-disable-next-line sonarjs/cognitive-complexity
                    enter(rawNode) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const node = rawNode as any;

                        if (
                            node.type === "NewExpression" &&
                            node.callee.type === "Identifier" &&
                            constructorSet.has(node.callee.name) &&
                            // Don't double-annotate if rollup already has a pure annotation
                            !node._rollupAnnotations?.some((a: { type: string }) => a.type === "pure")
                        ) {
                            s.prependLeft(node.start, "/* @__PURE__ */ ");
                            hasChanges = true;
                        }
                    },
                });

                if (!hasChanges) {
                    return undefined;
                }

                return {
                    code: s.toString(),
                    map: options.sourcemap ? s.generateMap({ hires: true }) : undefined,
                };
            },
        },
    };
};
