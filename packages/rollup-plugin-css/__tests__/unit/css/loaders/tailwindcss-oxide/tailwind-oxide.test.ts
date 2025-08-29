import { describe, expect, it, vi } from "vitest";

import tailwindcssLoader from "../../../../../src/loaders/tailwindcss-oxide";

// Mock Tailwind Oxide dependencies
vi.mock("@tailwindcss/node", () => {
    return {
        compile: vi.fn().mockResolvedValue({
            build: vi.fn(() => "compiled-css"),
            buildSourceMap: vi.fn(() => { return { raw: "sourcemap" }; }),
            features: 8, // Features.Utilities
            root: null,
            sources: [],
        }),
        env: { DEBUG: false },
        Features: {
            AtApply: 1,
            JsPluginCompat: 2,
            ThemeFunction: 4,
            Utilities: 8,
        },
        Instrumentation: class {
            start() {}

            end() {}
        },
        normalizePath: vi.fn((path) => path),
        optimize: vi.fn((code) => { return { code, map: undefined }; }),
        toSourceMap: vi.fn(() => { return { raw: "sourcemap" }; }),
    };
});

vi.mock("@tailwindcss/node/require-cache", () => {
    return {
        clearRequireCache: vi.fn(),
    };
});

vi.mock("@tailwindcss/oxide", () => {
    return {
        Scanner: class {
            scan() {
                return [];
            }

            get files() {
                return [];
            }

            get globs() {
                return [];
            }
        },
    };
});

// Mock RollupLogger
const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
};

describe("tailwind-oxide loader", () => {
    it("should have the correct name", () => {
        expect.assertions(1);

        expect(tailwindcssLoader.name).toBe("tailwindcss");
    });

    it("should match CSS files", () => {
        expect.assertions(3);

        expect(tailwindcssLoader.test).toBeInstanceOf(RegExp);
        expect(tailwindcssLoader.test?.test("styles.css")).toBe(true);
        expect(tailwindcssLoader.test?.test("styles.scss")).toBe(false);
    });

    it("should process CSS content", async () => {
        expect.assertions(2);

        const mockContext = {
            deps: new Set<string>(),
            environment: "development",
            id: "/test/styles.css",
            logger: mockLogger,
            sourceDir: "/test",
            useSourcemap: true,
        };

        // Bind the context to the loader
        const boundLoader = tailwindcssLoader.process.bind(mockContext);

        const result = await boundLoader({
            code: "@tailwind utilities;",
            map: undefined,
        });

        expect(result).toBeDefined();
        expect(typeof result.code).toBe("string");
    });
});
