/* eslint-disable max-classes-per-file, class-methods-use-this -- mock classes used to stub external module exports do not need `this`, and several distinct mocks are colocated for clarity */
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import tailwindcssLoader from "../../../../../src/loaders/tailwindcss-oxide";
import type { LoaderContext } from "../../../../../src/loaders/types";

interface CompiledTailwind {
    build: (candidates: string[]) => string;
    buildSourceMap: () => { raw: string };
    features: number;
    root: undefined;
    sources: string[];
}

// Mock Tailwind Oxide dependencies
vi.mock(import("@tailwindcss/node"), () => {
    class Instrumentation {
        public start(): void {
            // no-op for tests
        }

        public end(): void {
            // no-op for tests
        }
    }

    return {
        compile: vi.fn<() => Promise<CompiledTailwind>>().mockResolvedValue({
            build: vi.fn<(candidates: string[]) => string>(() => "compiled-css"),
            buildSourceMap: vi.fn<() => { raw: string }>(() => {
                return { raw: "sourcemap" };
            }),
            features: 8, // Features.Utilities
            root: undefined,
            sources: [],
        }),
        env: { DEBUG: false },
        Features: {
            AtApply: 1,
            JsPluginCompat: 2,
            ThemeFunction: 4,
            Utilities: 8,
        },
        Instrumentation,
        normalizePath: vi.fn<(path: string) => string>((path) => path),
        optimize: vi.fn<(code: string) => { code: string; map: undefined }>((code) => {
            return { code, map: undefined };
        }),
        toSourceMap: vi.fn<() => { raw: string }>(() => {
            return { raw: "sourcemap" };
        }),
    } as unknown as typeof import("@tailwindcss/node");
});

vi.mock(import("@tailwindcss/node/require-cache"), () => {
    return {
        clearRequireCache: vi.fn<() => void>(),
    };
});

vi.mock(import("@tailwindcss/oxide"), () => {
    class Scanner {
        public scan(): string[] {
            return [];
        }

        public get files(): string[] {
            return [];
        }

        public get globs(): string[] {
            return [];
        }
    }

    return { Scanner } as unknown as typeof import("@tailwindcss/oxide");
});

// Mock RollupLogger
const mockLogger = {
    debug: vi.fn<(...args: unknown[]) => void>(),
    error: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
};

describe("tailwind-oxide loader", () => {
    it("should have the correct name", () => {
        expect.assertions(1);

        expect(tailwindcssLoader.name).toBe("tailwindcss");
    });

    it("should match CSS files", () => {
        expect.assertions(3);

        expect(tailwindcssLoader.test).toBeInstanceOf(RegExp);
        expect((tailwindcssLoader.test as RegExp).test("styles.css")).toBe(true);
        expect((tailwindcssLoader.test as RegExp).test("styles.scss")).toBe(false);
    });

    it("should process CSS content", async () => {
        expect.assertions(1);

        const mockContext = {
            deps: new Set<string>(),
            environment: "development",
            id: "/test/styles.css",
            logger: mockLogger,
            sourceDir: "/test",
            useSourcemap: true,
        } as unknown as LoaderContext;

        // Bind the context to the loader
        const { process } = tailwindcssLoader;
        const boundLoader = process.bind(mockContext);

        const result = await boundLoader({
            code: "@tailwind utilities;",
            map: undefined,
        });

        expect(result).toBeDefined();

        expectTypeOf(result.code).toBeString();
    });
});
