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
        expect.assertions(4);

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

        expect(result.code).toMatchInlineSnapshot(`
          "import { createRequire as __cjs_createRequire } from "node:module";

          const __cjs_require = __cjs_createRequire(import.meta.url);

          const __cjs_getProcess = typeof globalThis !== "undefined" && typeof globalThis.process !== "undefined" ? globalThis.process : process;

          const __cjs_getBuiltinModule = (module) => {
              // Check if we're in Node.js and version supports getBuiltinModule
              if (typeof __cjs_getProcess !== "undefined" && __cjs_getProcess.versions && __cjs_getProcess.versions.node) {
                  const [major, minor] = __cjs_getProcess.versions.node.split(".").map(Number);
                  // Node.js 20.16.0+ and 22.3.0+
                  if (major > 22 || (major === 22 && minor >= 3) || (major === 20 && minor >= 16)) {
                      return __cjs_getProcess.getBuiltinModule(module);
                  }
              }
              // Fallback to createRequire
              return __cjs_require(module);
          };

          const {
            readFileSync
          } = __cjs_getBuiltinModule("fs");
          const typescript = __cjs_require("typescript");

          export const test = 'hello';"
        `);
    });

    it("plugin handles node:process import with runtime helpers", async () => {
        expect.assertions(5);

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
