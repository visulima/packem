import { init } from "cjs-module-lexer";
import type { ObjectHook, Plugin, RenderedChunk } from "rollup";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { requireCJSTransformerPlugin } from "../../../src/plugins/require-cjs-transformer";

type RenderChunkHook = NonNullable<Plugin["renderChunk"]>;
type RenderChunkHandler = RenderChunkHook extends ObjectHook<infer Handler> ? Handler : RenderChunkHook;
type RenderChunkResult = { code: string; map?: unknown };

const getRenderChunkHandler = (plugin: Plugin): RenderChunkHandler => {
    const hook = plugin.renderChunk;

    if (typeof hook === "function") {
        return hook;
    }

    if (hook && typeof hook === "object" && "handler" in hook && typeof hook.handler === "function") {
        return hook.handler;
    }

    throw new Error("plugin.renderChunk is not callable");
};

describe(requireCJSTransformerPlugin, async () => {
    await init();

    it("plugin exports correctly", () => {
        expect.assertions(3);

        const plugin = requireCJSTransformerPlugin({}, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        expect(plugin).toBeDefined();
        expect(plugin.name).toBe("packem:plugin-require-cjs");
        expect(plugin.renderChunk).toBeDefined();
    });

    it("plugin handles CJS modules correctly", async () => {
        expect.assertions(4);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        // Mock chunk with CJS import
        const code = `import { readFileSync } from 'fs';
import typescript from 'typescript';

export const test = 'hello';`;

        // Mock logger for testing
        const mockLogger = {
            debug: vi.fn<() => void>(),
        };

        const result = (await getRenderChunkHandler(plugin).call(
            { debug: mockLogger.debug } as unknown as ThisParameterType<RenderChunkHandler>,
            code,
            { fileName: "test.js" } as RenderedChunk,
            { format: "es" } as Parameters<RenderChunkHandler>[2],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        )) as RenderChunkResult;

        // Should transform the code
        expect(result).toBeDefined();

        expectTypeOf(result).toBeObject();

        expect("code" in result).toBe(true);
        expect("map" in result).toBe(true);

        expect(result.code).toMatchInlineSnapshot(`
          "import { createRequire as __cjs_createRequire } from "node:module";

          let __cjs_cachedRequire;
          const __cjs_require = (id) => {
              return (__cjs_cachedRequire ??= __cjs_createRequire(import.meta.url))(id);
          };

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

    it("dedupes a bare __cjs_require even when rollup deconflicted the createRequire call", async () => {
        expect.assertions(3);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        // Simulates a bundled dependency whose own packem-built dist already shipped a
        // `const __cjs_require = ...createRequire...(...)` shim. Rollup keeps one such
        // declaration with the bare name but renames the `createRequire` import to a
        // deconflicted `createRequire$2`. The renderChunk preamble then prepends a second
        // (lazy) `const __cjs_require = (id) => { ... };`, so the output must collapse back to
        // a single declaration — keeping the prepended lazy copy and dropping the eager one —
        // or esbuild fails with "The symbol __cjs_require has already been declared".
        const code = `const __cjs_require = createRequire$2(import.meta.url);
import typescript from 'typescript';

export const test = typescript;`;

        const result = (await getRenderChunkHandler(plugin).call(
            { debug: vi.fn<() => void>() } as unknown as ThisParameterType<RenderChunkHandler>,
            code,
            { fileName: "test.js" } as RenderedChunk,
            { format: "es" } as Parameters<RenderChunkHandler>[2],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        )) as RenderChunkResult;

        const declarationCount = [...result.code.matchAll(/const\s+__cjs_require\s*=/g)].length;

        expect(result.code).toContain("(__cjs_cachedRequire ??= __cjs_createRequire(import.meta.url))(id)");
        expect(result.code).not.toContain("createRequire$2");
        expect(declarationCount).toBe(1);
    });

    it("dedupes every declared REGEX_PATTERN, so a new shim line cannot be forgotten", async () => {
        expect.assertions(1);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        // The real defect was a pattern that existed but was never consumed.
        // Feed the whole shim in twice: whatever REGEX_PATTERNS covers must
        // collapse to one copy, so adding a pattern without wiring it into
        // removeDuplicates fails here rather than at a consumer's build.
        const shim = `import { createRequire as __cjs_createRequire } from "node:module";
let __cjs_cachedRequire;
const __cjs_require = (id) => {
    return (__cjs_cachedRequire ??= __cjs_createRequire(import.meta.url))(id);
};
const __cjs_getProcess = typeof globalThis !== "undefined" && typeof globalThis.process !== "undefined" ? globalThis.process : process;
const __cjs_getBuiltinModule = (module) => {
    return __cjs_require(module);
};`;

        const result = (await getRenderChunkHandler(plugin).call(
            { debug: vi.fn<() => void>() } as unknown as ThisParameterType<RenderChunkHandler>,
            `${shim}\n${shim}\nimport typescript from 'typescript';\n\nexport const test = typescript;`,
            { fileName: "test.js" } as RenderedChunk,
            { format: "es" } as Parameters<RenderChunkHandler>[2],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        )) as RenderChunkResult;

        const duplicated = [
            ["let __cjs_cachedRequire", /let\s+__cjs_cachedRequire\s*;/g],
            ["const __cjs_require", /const\s+__cjs_require\s*=/g],
            ["const __cjs_getProcess", /const\s+__cjs_getProcess\s*=/g],
            ["const __cjs_getBuiltinModule", /const\s+__cjs_getBuiltinModule\s*=/g],
            ["createRequire import", /import\s*\{\s*createRequire/g],
        ].filter(([, pattern]) => [...result.code.matchAll(pattern as RegExp)].length > 1).map(([name]) => name);

        expect(duplicated).toStrictEqual([]);
    });

    it("dedupes the `let __cjs_cachedRequire` backing store, not just the require arrow", async () => {
        expect.assertions(3);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        // A chunk that inlines a dependency already carrying the *current* lazy shim.
        // Both halves get duplicated, and the `const __cjs_require` half was the only one
        // being deduped — leaving two `let __cjs_cachedRequire;` declarations behind, which
        // is a hard `SyntaxError: Identifier '__cjs_cachedRequire' has already been declared`
        // at module load. Bundling anything built by such a chunk then fails outright.
        const code = `let __cjs_cachedRequire;
const __cjs_require = (id) => {
    return (__cjs_cachedRequire ??= __cjs_createRequire(import.meta.url))(id);
};
import typescript from 'typescript';

export const test = typescript;`;

        const result = (await getRenderChunkHandler(plugin).call(
            { debug: vi.fn<() => void>() } as unknown as ThisParameterType<RenderChunkHandler>,
            code,
            { fileName: "test.js" } as RenderedChunk,
            { format: "es" } as Parameters<RenderChunkHandler>[2],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        )) as RenderChunkResult;

        const cachedCount = [...result.code.matchAll(/let\s+__cjs_cachedRequire\s*;/g)].length;
        const requireCount = [...result.code.matchAll(/const\s+__cjs_require\s*=/g)].length;

        expect(cachedCount).toBe(1);
        expect(requireCount).toBe(1);
        // The surviving pair must still be wired together.
        expect(result.code).toContain("(__cjs_cachedRequire ??= __cjs_createRequire(import.meta.url))(id)");
    });

    it("dedupes __cjs_getBuiltinModule even when rollup renamed the arrow param", async () => {
        expect.assertions(3);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        // Simulates a bundled dependency whose own packem-built dist already shipped a
        // `const __cjs_getBuiltinModule = (module) => {...}` helper. Because `module`
        // collided at chunk scope, rollup deconflicted the arrow param to `module2` on the
        // surviving copy and renamed a third copy's *symbol* to `__cjs_getBuiltinModule$1`.
        // The renderChunk preamble (triggered by the `fs` import) then prepends a fresh
        // `(module)` copy, so the output must collapse the same-named copies back to one
        // while preserving the distinct `$1` symbol — otherwise esbuild fails with
        // "The symbol __cjs_getBuiltinModule has already been declared".
        const code = `const __cjs_getBuiltinModule = (module2) => {
    return __cjs_require(module2);
};
const __cjs_getBuiltinModule$1 = (module) => {
    return __cjs_require(module);
};
import { readFileSync } from 'fs';

export const test = readFileSync;`;

        const result = (await getRenderChunkHandler(plugin).call(
            { debug: vi.fn<() => void>() } as unknown as ThisParameterType<RenderChunkHandler>,
            code,
            { fileName: "test.js" } as RenderedChunk,
            { format: "es" } as Parameters<RenderChunkHandler>[2],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        )) as RenderChunkResult;

        // Exactly one base-name declaration survives (param name is irrelevant to the count).
        const baseDeclarationCount = [...result.code.matchAll(/const\s+__cjs_getBuiltinModule\s*=/g)].length;
        // The deconflicted `$1` symbol is a distinct binding and must NOT be removed.
        const suffixedDeclarationCount = [...result.code.matchAll(/const\s+__cjs_getBuiltinModule\$1\s*=/g)].length;

        expect(baseDeclarationCount).toBe(1);
        expect(suffixedDeclarationCount).toBe(1);
        expect(result.code).toContain("__cjs_getBuiltinModule$1");
    });

    it("plugin handles node:process import with runtime helpers", async () => {
        expect.assertions(5);

        const plugin = requireCJSTransformerPlugin({ builtinNodeModules: true }, {
            debug: vi.fn<() => void>(),
            error: vi.fn<() => void>(),
            info: vi.fn<() => void>(),
            warn: vi.fn<() => void>(),
        } as unknown as Console);

        // Mock chunk with node:process import
        const code = `import process from 'node:process';

console.log(process.version);`;

        // Mock logger for testing
        const mockLogger = {
            debug: vi.fn<() => void>(),
        };

        const result = (await getRenderChunkHandler(plugin).call(
            { debug: mockLogger.debug } as unknown as ThisParameterType<RenderChunkHandler>,
            code,
            { fileName: "test.js" } as RenderedChunk,
            { format: "es" } as Parameters<RenderChunkHandler>[2],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any,
        )) as RenderChunkResult;

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
