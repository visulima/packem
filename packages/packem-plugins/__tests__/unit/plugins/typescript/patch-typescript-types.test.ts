import type { NormalizedOutputOptions, ObjectHook, Plugin, RenderedChunk } from "rollup";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { PatchTypesOptions } from "../../../../src/plugins/typescript/patch-typescript-types";
import { patchTypescriptTypes } from "../../../../src/plugins/typescript/patch-typescript-types";

const UNHANDLED_INTERNAL_REGEX = /has unhandled @internal declarations/;
const MISSING_IMPORT_REGEX = /does not import "Bar\$1" from "\.\/types\.js"/;

type RenderChunkHook = NonNullable<Plugin["renderChunk"]>;
type RenderChunkHandler = RenderChunkHook extends ObjectHook<infer Handler> ? Handler : RenderChunkHook;

const getRenderChunkHandler = (plugin: Plugin): RenderChunkHandler => {
    const hook = plugin.renderChunk;

    if (typeof hook === "function") {
        return hook;
    }

    if (hook && typeof hook === "object" && "handler" in hook && typeof hook.handler === "function") {
        return hook.handler;
    }

    throw new TypeError("plugin.renderChunk is not callable");
};

const asString = (result: unknown): string => {
    if (typeof result === "string") {
        return result;
    }

    if (result && typeof result === "object" && "code" in result && typeof (result as { code: string }).code === "string") {
        return (result as { code: string }).code;
    }

    throw new TypeError("renderChunk did not return a string");
};

describe(patchTypescriptTypes, () => {
    let mockWarn: ReturnType<typeof vi.fn>;
    let mockLogger: { warn: ReturnType<typeof vi.fn> };
    let originalExitCode: number | string | null | undefined;

    beforeEach(() => {
        originalExitCode = process.exitCode;
        process.exitCode = 0;
        mockWarn = vi.fn();
        mockLogger = { warn: vi.fn() };
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
    });

    const runRenderChunk = (code: string, chunk: Partial<RenderedChunk> = {}, options: PatchTypesOptions = {}): string => {
        const plugin = patchTypescriptTypes(options, mockLogger as unknown as Console);
        const handler = getRenderChunkHandler(plugin);
        const context = { warn: mockWarn } as unknown as ThisParameterType<RenderChunkHandler>;
        const fullChunk = {
            fileName: "test.d.ts",
            ...chunk,
        } as RenderedChunk;
        const result = handler.call(context, code, fullChunk, {} as NormalizedOutputOptions, { chunks: {} });

        return asString(result);
    };

    describe("plugin shape", () => {
        it("returns a plugin named 'packem:patch-types' with a renderChunk hook", () => {
            expect.assertions(2);

            const plugin = patchTypescriptTypes({}, mockLogger as unknown as Console);

            expect(plugin).toBeInstanceOf(Object);
            expect(plugin.name).toBe("packem:patch-types");

            expectTypeOf(getRenderChunkHandler(plugin)).toBeFunction();
        });
    });

    // These tests pin the babel-dependent `@internal` stripping behavior so it survives
    // the migration to oxc-parser. They assert against the public `renderChunk` output, so
    // they are parser-agnostic — any implementation (babel or oxc) that produces the same
    // output will pass.
    describe("stripInternalTypes (babel → oxc migration target)", () => {
        it("is a no-op when @internal does not appear in the code", () => {
            expect.assertions(1);

            const code = "declare function foo(x: number): string;\n";

            expect(runRenderChunk(code)).toBe(code);
        });

        it("strips a top-level declaration preceded by /* @internal */", () => {
            expect.assertions(1);

            const code = ["declare function helper(): void;", "/* @internal */", "declare function internal(): void;", "export { helper };", ""].join("\n");

            const expected = ["declare function helper(): void;", "", "export { helper };", ""].join("\n");

            expect(runRenderChunk(code)).toBe(expected);
        });

        it("strips a function parameter mid-list including the trailing comma", () => {
            expect.assertions(1);

            const code = "declare function foo(a: number, /* @internal */ b: string, c: boolean): void;\n";

            // Removal range is [comment.start, paramNode.end + 1) — comma included.
            // The original space after the first `,` and the space after the removed `,` both
            // remain, producing a double space between `a: number,` and `c: boolean`.
            const expected = "declare function foo(a: number,  c: boolean): void;\n";

            expect(runRenderChunk(code)).toBe(expected);
        });

        it("strips a class member preceded by /* @internal */", () => {
            expect.assertions(1);

            const code = ["declare class C {", "    foo: number;", "    /* @internal */", "    bar: string;", "    baz: boolean;", "}", ""].join("\n");

            // Indentation before the comment is NOT part of the comment, so line 3 retains
            // its 4-space indent (followed by the newline that originally ended the comment line).
            const expected = ["declare class C {", "    foo: number;", "    ", "    baz: boolean;", "}", ""].join("\n");

            expect(runRenderChunk(code)).toBe(expected);
        });

        it("strips multiple @internal markers in the same file", () => {
            expect.assertions(1);

            const code = [
                "/* @internal */",
                "declare function a(): void;",
                "declare function b(): void;",
                "/* @internal */",
                "declare function c(): void;",
                "export { b };",
                "",
            ].join("\n");

            const expected = ["", "declare function b(): void;", "", "export { b };", ""].join("\n");

            expect(runRenderChunk(code)).toBe(expected);
        });

        it("preserves block comments that do not contain @internal", () => {
            expect.assertions(1);

            const code = "/* not internal */\ndeclare function foo(): void;\n";

            // The strip step early-returns because the code has no `@internal` substring,
            // and `cleanUnnecessaryComments` preserves non-license block comments.
            expect(runRenderChunk(code)).toBe(code);
        });

        it("throws when a `// @internal` line comment is used (only block comments are handled)", () => {
            expect.assertions(1);

            const code = ["// @internal", "declare function foo(): void;", ""].join("\n");

            // `code.includes("@internal")` is true so the parser runs, but the matcher
            // only targets `Block` comments. The line comment survives, so the
            // post-walk invariant check finds `@internal` still in the output and throws.
            expect(() => runRenderChunk(code, { fileName: "line-comment.d.ts" })).toThrow(UNHANDLED_INTERNAL_REGEX);
        });

        it("throws when @internal appears outside a comment block (e.g. string literal)", () => {
            expect.assertions(1);

            const code = `declare const x: "@internal value";\n`;

            expect(() => runRenderChunk(code, { fileName: "string-literal.d.ts" })).toThrow(UNHANDLED_INTERNAL_REGEX);
        });

        it("strips a declaration preceded by multiple stacked /* @internal */ comments", () => {
            expect.assertions(1);

            // Two consecutive @internal markers on the same declaration. Babel attached both
            // as `leadingComments` to the same node and used the earliest comment's start as
            // the removal anchor; the oxc port must replicate that by skipping past intervening
            // comments when computing each comment's `nextStart`.
            const code = ["/* @internal */", "/* @internal */", "declare const x: number;", "export {};", ""].join("\n");

            const expected = ["", "export {};", ""].join("\n");

            expect(runRenderChunk(code, { fileName: "stacked.d.ts" })).toBe(expected);
        });

        it("strips a declaration preceded by a JSDoc-style /** @internal */ comment", () => {
            expect.assertions(1);

            // Block comments starting with `/**` are still `Block` comments to oxc; the value
            // is ` @internal ` (with leading `*` from the JSDoc style trimmed by the parser).
            const code = ["/** @internal */", "declare const x: number;", "export {};", ""].join("\n");

            const expected = ["", "export {};", ""].join("\n");

            expect(runRenderChunk(code, { fileName: "jsdoc.d.ts" })).toBe(expected);
        });

        it("strips the last parameter when marked @internal (no trailing comma to consume)", () => {
            expect.assertions(1);

            // No trailing comma after the @internal parameter, so `code[end] !== ","` and the
            // outer `,` after the previous parameter is left orphaned — documents the
            // hanging-comma artifact carried over from the babel implementation.
            const code = "declare function foo(a: number, /* @internal */ b: string): void;\n";

            const expected = "declare function foo(a: number, ): void;\n";

            expect(runRenderChunk(code, { fileName: "last-param.d.ts" })).toBe(expected);
        });

        it("strips an interface property preceded by /* @internal */", () => {
            expect.assertions(1);

            // Interface members are TSPropertySignature in TS-ESTree (distinct from class
            // PropertyDefinition). The matcher walks every node, so it picks them up too.
            const code = ["declare interface I {", "    foo: number;", "    /* @internal */", "    bar: string;", "    baz: boolean;", "}", ""].join("\n");

            const expected = ["declare interface I {", "    foo: number;", "    ", "    baz: boolean;", "}", ""].join("\n");

            expect(runRenderChunk(code, { fileName: "interface.d.ts" })).toBe(expected);
        });
    });

    // eslint-disable-next-line no-secrets/no-secrets -- describe block label, not a credential
    describe("replaceConfusingTypeNames", () => {
        it("rewrites `Foo$1` identifiers using identifierReplacements", () => {
            expect.assertions(1);

            const code = [`import { Foo as Foo$1 } from "./types.js";`, `export type X = Foo$1;`, ""].join("\n");

            const result = runRenderChunk(code, { fileName: "replacements.d.ts" }, { identifierReplacements: { "./types.js": { Foo$1: "Foo" } } });

            expect(result).toBe(`import { Foo as Foo } from "./types.js";\nexport type X = Foo;\n`);
        });

        it("pre-emptively removes the named import when the replacement targets a namespace member", () => {
            expect.assertions(1);

            const code = [`import dep, { Foo as Foo$1 } from "./types.js";`, `export type X = Foo$1;`, ""].join("\n");

            const result = runRenderChunk(code, { fileName: "ns-replacements.d.ts" }, { identifierReplacements: { "./types.js": { Foo$1: "dep.Foo" } } });

            expect(result).toBe(`import dep, { } from "./types.js";\nexport type X = dep.Foo;\n`);
        });

        it("warns and sets process.exitCode when the configured module is not imported", () => {
            expect.assertions(2);

            const code = `export type X = number;\n`;

            runRenderChunk(code, { fileName: "missing-module.d.ts" }, { identifierReplacements: { "./missing.js": { Foo$1: "Foo" } } });

            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining(`does not import "./missing.js"`));
            expect(process.exitCode).toBe(1);
        });

        it("throws when the configured identifier is not present in the matching import", () => {
            expect.assertions(1);

            const code = [`import { Foo as Foo$1 } from "./types.js";`, `export type X = Foo$1;`, ""].join("\n");

            expect(() => runRenderChunk(code, { fileName: "missing-identifier.d.ts" }, { identifierReplacements: { "./types.js": { Bar$1: "Bar" } } })).toThrow(
                MISSING_IMPORT_REGEX,
            );
        });

        it("logs a warning for unreplaced `$N` identifiers", () => {
            expect.assertions(1);

            const code = [`import { Foo as Foo$1 } from "./types.js";`, `export type X = Foo$1;`, ""].join("\n");

            // No identifierReplacements provided, so `Foo$1` stays in the output and is
            // reported via the logger.
            runRenderChunk(code, { fileName: "unreplaced-warn.d.ts" });

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.stringContaining returns `any` from vitest's matcher typings
                    message: expect.stringContaining("contains confusing identifier names"),
                    prefix: "plugin:patch-types",
                }),
            );
        });
    });

    describe("cleanUnnecessaryComments", () => {
        it("strips block comments that mention `MIT License` (dedup of bundled license headers)", () => {
            expect.assertions(1);

            const code = "/* MIT License - foo */\ndeclare const x: number;\n";

            expect(runRenderChunk(code)).not.toContain("MIT License");
        });

        it("strips block comments that mention `BSD license`", () => {
            expect.assertions(1);

            const code = "/* Some BSD license header */\ndeclare const x: number;\n";

            expect(runRenderChunk(code)).not.toContain("BSD license");
        });

        it("preserves non-license block comments", () => {
            expect.assertions(1);

            const code = "/* some docs */\ndeclare const x: number;\n";

            expect(runRenderChunk(code)).toContain("some docs");
        });

        it("collapses 3+ consecutive newlines down to 2", () => {
            expect.assertions(1);

            const code = "declare const x: number;\n\n\n\ndeclare const y: number;\n";

            expect(runRenderChunk(code)).toBe("declare const x: number;\n\ndeclare const y: number;\n");
        });
    });

    describe("integration", () => {
        it("runs replace → strip → clean in sequence", () => {
            expect.assertions(1);

            const code = [
                "/* MIT License */",
                `import { Foo as Foo$1 } from "./types.js";`,
                "/* @internal */",
                "declare const hidden: Foo$1;",
                "declare const visible: Foo$1;",
                "",
            ].join("\n");

            const result = runRenderChunk(code, { fileName: "integration.d.ts" }, { identifierReplacements: { "./types.js": { Foo$1: "Foo" } } });

            // 1. `Foo$1` is rewritten to `Foo`.
            // 2. `/* @internal */ declare const hidden: ...;` is stripped.
            // 3. The `MIT License` header is stripped by cleanUnnecessaryComments.
            // 4. Consecutive newlines are collapsed to at most two.
            const expected = ["", `import { Foo as Foo } from "./types.js";`, "", "declare const visible: Foo;", ""].join("\n");

            expect(result).toBe(expected);
        });
    });
});
