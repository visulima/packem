import fs from "node:fs/promises";

import type { ObjectHook, Plugin, PluginContext, ResolvedId } from "rollup";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { debarrelPlugin } from "../../../src/plugins/debarrel";

type TransformHook = NonNullable<Plugin["transform"]>;
type TransformHandler = TransformHook extends ObjectHook<infer Handler> ? Handler : TransformHook;
type ResolveFunction = PluginContext["resolve"];

const getTransformHandler = (plugin: Plugin): TransformHandler => {
    const hook = plugin.transform;

    if (typeof hook === "function") {
        return hook;
    }

    if (hook && typeof hook === "object" && "handler" in hook && typeof hook.handler === "function") {
        return hook.handler;
    }

    throw new Error("plugin.transform is not callable");
};

// Mock fs module
vi.mock(import("node:fs/promises"), () => ({
    default: {
        readFile: vi.fn<(path: string, encoding?: string) => Promise<string>>(),
    },
}) as unknown as typeof import("node:fs/promises"));

// Mock rs-module-lexer to avoid memory issues in tests
vi.mock(import("rs-module-lexer"), () => ({
    parseAsync: vi.fn<() => Promise<{ output: { exports: unknown[]; facade: boolean; filename: string; hasModuleSyntax: boolean; imports: unknown[] }[] }>>().mockResolvedValue({
        output: [
            {
                exports: [],
                facade: false,
                filename: "",
                hasModuleSyntax: true,
                imports: [],
            },
        ],
    }),
}) as unknown as typeof import("rs-module-lexer"));

describe(debarrelPlugin, () => {
    const mockLogger = {
        debug: vi.fn<() => void>(),
        error: vi.fn<() => void>(),
        info: vi.fn<() => void>(),
        warn: vi.fn<() => void>(),
    };

    const mockResolve = vi.fn<ResolveFunction>();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should read original file content for parsing, not transformed code", async () => {
        expect.assertions(2);

        const originalCode = `import { foo, bar } from './barrel';`;
        const transformedCode = `import { foo, bar } from './barrel';
// Some transformed code here`;

        // Mock fs.readFile to return original code
        vi.mocked(fs.readFile).mockResolvedValue(originalCode);

        const plugin = debarrelPlugin({}, mockLogger as unknown as Console);

        const mockContext = {
            resolve: mockResolve,
        } as unknown as ThisParameterType<TransformHandler>;

        mockResolve.mockResolvedValue({
            external: false,
            id: "/test/barrel.ts",
        } as ResolvedId);

        // Call transform with transformed code
        await getTransformHandler(plugin).call(mockContext, transformedCode, "/test/file.ts", { ssr: false });

        // Verify fs.readFile was called to read original file (not parsing transformed code)
        expect(fs.readFile).toHaveBeenCalledWith("/test/file.ts", "utf8");
        expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it("should skip non-source files", async () => {
        expect.assertions(1);

        const plugin = debarrelPlugin({}, mockLogger as unknown as Console);

        const mockContext = {
            resolve: mockResolve,
        } as unknown as ThisParameterType<TransformHandler>;

        // Call transform with non-source file
        const result = await getTransformHandler(plugin).call(mockContext, "code", "/test/file.css", { ssr: false });

        // Should return undefined (not processed)
        expect(result).toBeUndefined();
    });

    it("should cache file reads", async () => {
        expect.assertions(2);

        const originalCode = `import { foo } from './barrel';`;

        vi.mocked(fs.readFile).mockResolvedValue(originalCode);

        const plugin = debarrelPlugin({}, mockLogger as unknown as Console);

        const mockContext = {
            resolve: mockResolve,
        } as unknown as ThisParameterType<TransformHandler>;

        mockResolve.mockResolvedValue({
            external: false,
            id: "/test/barrel.ts",
        } as ResolvedId);

        // Call transform twice with same file
        await getTransformHandler(plugin).call(mockContext, "code1", "/test/file.ts", { ssr: false });
        await getTransformHandler(plugin).call(mockContext, "code2", "/test/file.ts", { ssr: false });

        // fs.readFile should only be called once (cached)
        expect(fs.readFile).toHaveBeenCalledTimes(1);
        expect(fs.readFile).toHaveBeenCalledWith("/test/file.ts", "utf8");
    });
});
