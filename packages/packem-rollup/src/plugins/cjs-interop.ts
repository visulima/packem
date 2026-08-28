import type { Node } from "estree";
import MagicString from "magic-string";
import type { NormalizedOutputOptions, Plugin, ProgramNode, RenderedChunk, SourceMapInput } from "rollup";

// Cheap gate: only bother parsing when the chunk plausibly assigns to
// `exports`/`module.exports`. Avoids the parse cost on chunks that can't match.
const EXPORTS_GATE_RE = /\bexports\b/;

interface MemberLike {
    computed?: boolean;
    end?: number;
    object?: MemberLike & { name?: string };
    property?: { name?: string; type?: string; value?: unknown };
    start?: number;
    type?: string;
}

interface AssignmentExpressionNode {
    end?: number;
    left?: MemberLike;
    operator?: string;
    start?: number;
    type?: string;
}

// Resolve the static property name of an `exports.name` / `exports["name"]`
// member, or undefined for a computed/dynamic property.
const staticPropertyName = (property: MemberLike["property"]): string | undefined => {
    if (property?.type === "Identifier") {
        return property.name;
    }

    if (property?.type === "Literal" && typeof property.value === "string") {
        return property.value;
    }

    return undefined;
};

/**
 * Classify an assignment LHS. Returns `{ kind: "module" }` for `module.exports`,
 * `{ kind: "exports", name }` for `exports.name` / `exports["name"]`, or
 * undefined when the LHS is not a recognized export assignment target.
 */
const resolveExportTarget = (left: MemberLike | undefined): { kind: "exports" | "module"; name?: string } | undefined => {
    if (left?.type !== "MemberExpression" || left.object === undefined) {
        return undefined;
    }

    const propertyName = staticPropertyName(left.property);

    if (propertyName === undefined) {
        return undefined; // computed / dynamic property — leave untouched
    }

    // `module.exports = ...`
    if (left.object.type === "Identifier" && left.object.name === "module" && propertyName === "exports") {
        return { kind: "module" };
    }

    // `exports.<name> = ...` (NOT `module.exports.<name>`, whose object is a
    // MemberExpression, which falls through here and is left untouched).
    if (left.object.type === "Identifier" && left.object.name === "exports") {
        return { kind: "exports", name: propertyName };
    }

    return undefined;
};

// Rewrite a single top-level `exports.<name> = ...` assignment on `transformed`.
// Returns true when the assignment was the default export (so the caller knows a
// default was seen and the rewrite is worth emitting).
const rewriteExportAssignment = (transformed: MagicString, statement: Node): { changed: boolean; sawDefault: boolean } => {
    const noop = { changed: false, sawDefault: false };

    if ((statement as { type?: string }).type !== "ExpressionStatement") {
        return noop;
    }

    const { expression } = statement as unknown as { expression?: AssignmentExpressionNode };

    if (expression?.type !== "AssignmentExpression" || expression.operator !== "=") {
        return noop;
    }

    const target = resolveExportTarget(expression.left);

    // `module.exports = ...` is already the CJS default form and needs no rewrite;
    // the `__esModule` marker is a CallExpression statement that never matches.
    if (target === undefined || target.kind === "module") {
        return noop;
    }

    const left = expression.left as MemberLike;

    if (typeof left.start !== "number" || typeof left.end !== "number") {
        return noop;
    }

    if (target.name === "default") {
        // `exports.default = ...` / `exports["default"] = ...` -> `module.exports`
        transformed.overwrite(left.start, left.end, "module.exports");

        return { changed: true, sawDefault: true };
    }

    // `exports.<name> = ...` -> `module.exports.<name>`
    transformed.overwrite(left.start, left.end, `module.exports.${target.name ?? ""}`);

    return { changed: true, sawDefault: false };
};

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
        renderChunk(
            code: string,
            chunk: RenderedChunk,
            options: NormalizedOutputOptions,
        ):
            | {
                  code: string;
                  map: SourceMapInput;
              }
            | undefined {
            if (!chunk.isEntry) {
                return undefined;
            }

            if (options.format !== "cjs" || options.exports !== "auto") {
                return undefined;
            }

            if (!EXPORTS_GATE_RE.test(code)) {
                return undefined;
            }

            let ast: ProgramNode;

            try {
                ast = this.parse(code);
            } catch {
                return undefined;
            }

            const transformed = new MagicString(code);
            let changed = false;
            let sawDefault = false;

            // Only top-level statements are rewritten — assignments inside string
            // literals or comments never reach the AST, and nested assignments
            // (inside functions) are not entry-level CJS exports.
            for (const statement of (ast as unknown as { body: Node[] }).body) {
                const outcome = rewriteExportAssignment(transformed, statement);

                changed = changed || outcome.changed;
                sawDefault = sawDefault || outcome.sawDefault;
            }

            if (!sawDefault) {
                // Nothing to collapse to a default export → leave the chunk as-is,
                // matching the previous behaviour of bailing without a default.
                return undefined;
            }

            if (addDefaultProperty) {
                // Re-expose the (now default) module.exports under `.default` so
                // both `require(x)` and `require(x).default` resolve to it. Use the
                // literal RHS `module.exports` rather than re-evaluating the original
                // assignment's RHS, which could be a non-identifier expression.
                transformed.append("\nmodule.exports.default = module.exports;");
                changed = true;
            }

            if (!changed) {
                return undefined;
            }

            logger.debug({
                message: `Applied CommonJS interop to entry chunk ${chunk.fileName}.`,
                prefix: "plugin:cjs-interop",
            });

            return {
                code: transformed.toString(),
                map: transformed.generateMap({ hires: true }),
            };
        },
    };
};
