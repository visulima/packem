import { init } from "cjs-module-lexer";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { requireCJSTransformerPlugin } from "../../../src/plugins/require-cjs-transformer";

describe(requireCJSTransformerPlugin, async () => {
    await init();

    it("plugin exports correctly", () => {
        expect.assertions(3);

        const plugin = requireCJSTransformerPlugin({}, { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() });

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("packem:plugin-require-cjs");
        expect(plugin.renderChunk).toBeDefined();
    });

    it("plugin handles CJS modules correctly", async () => {
        expect.assertions(7);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() });

        // Mock chunk with CJS import
        const code = `import { readFileSync } from 'fs';
import typescript from 'typescript';

export const test = 'hello';`;

        // Mock logger for testing
        const mockLogger = {
            debug: vi.fn(),
        };

        const result = await plugin.renderChunk?.handler?.call({ debug: mockLogger.debug }, code, { fileName: "test.js" }, { format: "es" });

        // Should transform the code
        expect(result).toBeDefined();

        expectTypeOf(result).toBeObject();

        expect("code" in result).toBe(true);
        expect("map" in result).toBe(true);

        // Check that the transformation happened
        expect(result.code).toContain("__cjs_require");
        // The generated code now includes runtime capability helpers
        expect(result.code).toContain("const __cjs_getBuiltinModule = (module) => {");
        expect(result.code).toContain("__cjs_getBuiltinModule(\"fs\")");
        expect(result.code).toContain("const typescript = __cjs_require(\"typescript\")");
    });

    it("plugin handles node:process import with runtime helpers", async () => {
        expect.assertions(6);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() });

        // Mock chunk with node:process import
        const code = `import process from 'node:process';

console.log(process.version);`;

        // Mock logger for testing
        const mockLogger = {
            debug: vi.fn(),
        };

        const result = await plugin.renderChunk?.handler?.call({ debug: mockLogger.debug }, code, { fileName: "test.js" }, { format: "es" });

        // Should transform the code
        expect(result).toBeDefined();

        expectTypeOf(result).toBeObject();

        expect("code" in result).toBe(true);
        expect("map" in result).toBe(true);

        // Check that the transformation happened and runtime helpers are included
        expect(result.code).toContain("const process = __cjs_getProcess");
        expect(result.code).toContain("const __cjs_getProcess =");
    });
});
