import fs from "node:fs/promises";

import type { PluginContext } from "rollup";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { debarrelPlugin } from "../../../src/plugins/debarrel";

// Mock fs module
vi.mock(import("node:fs/promises"), () => {
    return {
        default: {
            readFile: vi.fn(),
        },
    };
});

// Mock rs-module-lexer to avoid memory issues in tests
vi.mock(import("rs-module-lexer"), () => {
    return {
        parseAsync: vi.fn().mockResolvedValue({
            output: [
                {
                    exports: [],
                    facade: false,
                    imports: [],
                },
            ],
        }),
    };
});

describe(debarrelPlugin, () => {
    const mockLogger = {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    };

    const mockResolve = vi.fn();

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

        const plugin = debarrelPlugin({}, mockLogger);

        const mockContext = {
            resolve: mockResolve,
        } as unknown as PluginContext;

        mockResolve.mockResolvedValue({
            external: false,
            id: "/test/barrel.ts",
        });

        // Call transform with transformed code
        await plugin.transform?.call(mockContext, transformedCode, "/test/file.ts");

        // Verify fs.readFile was called to read original file (not parsing transformed code)
        expect(fs.readFile).toHaveBeenCalledWith("/test/file.ts", "utf8");
        expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it("should skip non-source files", async () => {
        expect.assertions(1);

        const plugin = debarrelPlugin({}, mockLogger);

        const mockContext = {
            resolve: mockResolve,
        } as unknown as PluginContext;

        // Call transform with non-source file
        const result = await plugin.transform?.call(mockContext, "code", "/test/file.css");

        // Should return undefined (not processed)
        expect(result).toBeUndefined();
    });

    it("should cache file reads", async () => {
        expect.assertions(2);

        const originalCode = `import { foo } from './barrel';`;

        vi.mocked(fs.readFile).mockResolvedValue(originalCode);

        const plugin = debarrelPlugin({}, mockLogger);

        const mockContext = {
            resolve: mockResolve,
        } as unknown as PluginContext;

        mockResolve.mockResolvedValue({
            external: false,
            id: "/test/barrel.ts",
        });

        // Call transform twice with same file
        await plugin.transform?.call(mockContext, "code1", "/test/file.ts");
        await plugin.transform?.call(mockContext, "code2", "/test/file.ts");

        // fs.readFile should only be called once (cached)
        expect(fs.readFile).toHaveBeenCalledTimes(1);
        expect(fs.readFile).toHaveBeenCalledWith("/test/file.ts", "utf8");
    });
});
