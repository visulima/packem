import type { NormalizedOutputOptions, ProgramNode, RenderedChunk } from "rollup";
import { parseAst } from "rollup/parseAst";
import { describe, expect, it, vi } from "vitest";

import { cjsInteropPlugin } from "../../../src/plugins/cjs-interop";

const createLogger = () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() }) as unknown as Console;

const callRenderChunk = (
    plugin: ReturnType<typeof cjsInteropPlugin>,
    code: string,
    chunk: Partial<RenderedChunk>,
    options: Partial<NormalizedOutputOptions>,
) => {
    const { renderChunk } = plugin;
    const handler = (typeof renderChunk === "function" ? renderChunk : renderChunk?.handler) as (
        this: { parse: (code: string) => ProgramNode },
        code: string,
        chunk: RenderedChunk,
        options: NormalizedOutputOptions,
    ) => { code: string; map: unknown } | undefined;

    return handler.call({ parse: parseAst }, code, chunk as RenderedChunk, options as NormalizedOutputOptions);
};

describe("cjsInteropPlugin", () => {
    it("should return a plugin with the expected name", () => {
        expect.assertions(2);

        const plugin = cjsInteropPlugin({ logger: createLogger() });

        expect(plugin.name).toBe("packem:cjs-interop");
        expect(plugin.renderChunk).toBeTypeOf("function");
    });

    it("should skip non-entry chunks", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const result = callRenderChunk(plugin, "exports.default = 1;", { isEntry: false }, { exports: "auto", format: "cjs" });

        expect(result).toBeUndefined();
    });

    it("should skip ESM output", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const result = callRenderChunk(plugin, "exports.default = 1;", { isEntry: true }, { exports: "auto", format: "es" });

        expect(result).toBeUndefined();
    });

    it("should skip when exports mode is not 'auto'", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const result = callRenderChunk(plugin, "exports.default = 1;", { isEntry: true }, { exports: "named", format: "cjs" });

        expect(result).toBeUndefined();
    });

    it("should skip when no default export is found", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const result = callRenderChunk(plugin, "exports.foo = 1;", { isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result).toBeUndefined();
    });

    it("should rewrite exports.default to module.exports and named exports too", () => {
        expect.assertions(2);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const input = ["Object.defineProperty(exports, '__esModule', { value: true });", "exports.named = 2;", "exports.default = 1;"].join("\n");
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).toContain("module.exports.named = 2;");
        expect(result?.code).toContain("module.exports = 1;");
    });

    it("should rewrite exports['default'] (bracket form) to module.exports", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const input = "exports['default'] = 42;";
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).toContain("module.exports = 42;");
    });

    it("should NOT rewrite `exports.x = ` occurrences inside a string literal", () => {
        expect.assertions(2);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        // The string literal contains a decoy `exports.foo = 1;`. Only the real
        // top-level `exports.default` assignment must be rewritten.
        const input = ['const banner = "exports.foo = 1;";', "exports.default = banner;"].join("\n");
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        // The decoy inside the string literal is untouched.
        expect(result?.code).toContain('"exports.foo = 1;"');
        // The real assignment is rewritten.
        expect(result?.code).toContain("module.exports = banner;");
    });

    it("should NOT double-rewrite `module.exports.foo = ` member assignments", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const input = ["module.exports.foo = 1;", "exports.default = 2;"].join("\n");
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        // `module.exports.foo` must remain as-is (not become `module.module.exports.foo`).
        expect(result?.code).toContain("module.exports.foo = 1;");
    });

    it("should append `module.exports.default = module.exports;` literally when addDefaultProperty is true (identifier RHS)", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ addDefaultProperty: true, logger: createLogger() });
        const input = "exports.default = myValue;";
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).toContain("module.exports.default = module.exports;");
    });

    it("should append the literal default property exactly once for a non-identifier RHS", () => {
        expect.assertions(2);

        const plugin = cjsInteropPlugin({ addDefaultProperty: true, logger: createLogger() });
        // RHS is a CallExpression, NOT an identifier — re-evaluating it would be wrong.
        const input = "exports.default = createApp();";
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        const code = result?.code ?? "";

        expect(code).toContain("module.exports.default = module.exports;");
        // Exactly one occurrence, and the RHS is not re-evaluated.
        expect(code.match(/module\.exports\.default = module\.exports;/g)).toHaveLength(1);
    });

    it("should call logger.debug with chunk metadata when a transform is applied", () => {
        expect.assertions(2);

        const debug = vi.fn();
        const logger = { debug, error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() } as unknown as Console;
        const plugin = cjsInteropPlugin({ logger });
        const result = callRenderChunk(plugin, "exports.default = 1;", { fileName: "entry.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).toBeDefined();
        expect(debug).toHaveBeenCalledWith(expect.objectContaining({ prefix: "plugin:cjs-interop" }));
    });

    it("should return a sourcemap", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const result = callRenderChunk(plugin, "exports.default = 1;", { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.map).toBeDefined();
    });
});
