import type { NormalizedOutputOptions, RenderedChunk } from "rollup";
import { describe, expect, it, vi } from "vitest";

import { cjsInteropPlugin } from "../../../src/plugins/cjs-interop";

const createLogger = () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() }) as unknown as Console;

const callRenderChunk = (
    plugin: ReturnType<typeof cjsInteropPlugin>,
    code: string,
    chunk: Partial<RenderedChunk>,
    options: Partial<NormalizedOutputOptions>,
) => {
    const handler = plugin.renderChunk as (
        code: string,
        chunk: RenderedChunk,
        options: NormalizedOutputOptions,
    ) => { code: string; map: unknown } | undefined;

    return handler(code, chunk as RenderedChunk, options as NormalizedOutputOptions);
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

    it("should rewrite exports.default to module.exports and strip __esModule marker", () => {
        expect.assertions(2);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const input = [
            "Object.defineProperty(exports, '__esModule', { value: true });",
            "exports.named = 2;",
            "exports.default = 1;",
        ].join("\n");
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).not.toContain("__esModule");
        expect(result?.code).toContain("module.exports.named = 2;");
    });

    it("should rewrite exports['default'] (bracket form) to module.exports", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ logger: createLogger() });
        const input = "exports['default'] = 42;";
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).toContain("module.exports");
    });

    it("should append module.exports.default = ... when addDefaultProperty is true", () => {
        expect.assertions(1);

        const plugin = cjsInteropPlugin({ addDefaultProperty: true, logger: createLogger() });
        const input = "exports.default = myValue;";
        const result = callRenderChunk(plugin, input, { fileName: "out.cjs", isEntry: true }, { exports: "auto", format: "cjs" });

        expect(result?.code).toContain("module.exports.default = myValue;");
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
