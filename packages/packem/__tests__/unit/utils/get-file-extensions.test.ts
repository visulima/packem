import type { BuildContext } from "@visulima/packem-share/types";
import { describe, expect, it } from "vitest";

import type { InternalBuildOptions } from "../../../src/types";
import { getDtsExtension, getOutputExtension } from "../../../src/utils/get-file-extensions";

// Helper to create a minimal BuildContext for testing
const createContext = (options: Partial<InternalBuildOptions>): BuildContext<InternalBuildOptions> => ({
    options: {
        // Default options
        emitCJS: true,
        emitESM: true,
        node10Compatibility: false,
        outputExtensionMap: undefined,
        ...options,
    } as InternalBuildOptions,
    // Other context properties are not used by these functions
} as BuildContext<InternalBuildOptions>);

describe("getOutputExtension", () => {
    describe("when outputExtensionMap is provided", () => {
        it("should use outputExtensionMap for ESM", () => {
            const context = createContext({
                outputExtensionMap: { esm: "mjs", cjs: "cjs" },
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
        });

        it("should use outputExtensionMap for CJS", () => {
            const context = createContext({
                outputExtensionMap: { esm: "mjs", cjs: "cjs" },
            });

            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should use custom extensions from outputExtensionMap", () => {
            const context = createContext({
                outputExtensionMap: { esm: "js", cjs: "js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("js");
        });

        it("should fallback to default when format not in outputExtensionMap", () => {
            const context = createContext({
                outputExtensionMap: { esm: "mjs" }, // missing cjs
            });

            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });
    });

    describe("when Node.js 10 compatibility is enabled", () => {
        it("should use traditional extensions even without outputExtensionMap", () => {
            const context = createContext({
                node10Compatibility: true,
                emitESM: true,
                emitCJS: false,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should use traditional extensions when node10Compatibility is undefined (default true)", () => {
            const context = createContext({
                node10Compatibility: undefined,
                emitESM: true,
                emitCJS: false,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });
    });

    describe("when both ESM and CJS are emitted", () => {
        it("should use traditional extensions for clarity", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });
    });

    describe("when only one format is emitted", () => {
        it("should use .js for ESM when only ESM is emitted", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: false,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
        });

        it("should use .js for CJS when only CJS is emitted", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: false,
                emitCJS: true,
            });

            expect(getOutputExtension(context, "cjs")).toBe("js");
        });

        it("should use .js when neither format is explicitly emitted", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: false,
                emitCJS: false,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("js");
        });
    });
});

describe("getDtsExtension", () => {
    describe("when outputExtensionMap is provided", () => {
        it("should derive .d.mts from mjs extension", () => {
            const context = createContext({
                outputExtensionMap: { esm: "mjs", cjs: "cjs" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
        });

        it("should derive .d.cts from cjs extension", () => {
            const context = createContext({
                outputExtensionMap: { esm: "mjs", cjs: "cjs" },
            });

            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should derive .d.ts from js extension", () => {
            const context = createContext({
                outputExtensionMap: { esm: "js", cjs: "js" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should fallback to traditional extensions when format not in outputExtensionMap", () => {
            const context = createContext({
                outputExtensionMap: { esm: "mjs" }, // missing cjs
            });

            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should fallback to traditional extensions for unknown js extension", () => {
            const context = createContext({
                outputExtensionMap: { esm: "unknown", cjs: "weird" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should handle empty outputExtensionMap", () => {
            const context = createContext({
                outputExtensionMap: {},
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });

    describe("when Node.js 10 compatibility is enabled", () => {
        it("should use traditional extensions even without outputExtensionMap", () => {
            const context = createContext({
                node10Compatibility: true,
                emitESM: true,
                emitCJS: false,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should use traditional extensions when node10Compatibility is undefined (default true)", () => {
            const context = createContext({
                node10Compatibility: undefined,
                emitESM: true,
                emitCJS: false,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });

    describe("when both ESM and CJS are emitted", () => {
        it("should use traditional extensions for clarity", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });

    describe("when only one format is emitted", () => {
        it("should use .d.ts for ESM when only ESM is emitted", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: false,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
        });

        it("should use .d.ts for CJS when only CJS is emitted", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: false,
                emitCJS: true,
            });

            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should use .d.ts when neither format is explicitly emitted", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: false,
                emitCJS: false,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });
    });
});

describe("integration scenarios", () => {
    describe("modern single-format libraries", () => {
        it("should use .js/.d.ts for ESM-only modern library", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: false,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
        });

        it("should use .js/.d.ts for CJS-only modern library", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: false,
                emitCJS: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "cjs")).toBe("js");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });
    });

    describe("dual-format libraries", () => {
        it("should use traditional extensions for dual-format library", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });

    describe("legacy Node.js 10 support", () => {
        it("should use traditional extensions for legacy support", () => {
            const context = createContext({
                node10Compatibility: true,
                emitESM: true,
                emitCJS: false,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
        });
    });

    describe("custom extension mapping", () => {
        it("should respect custom .js mapping for all formats", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: true,
                outputExtensionMap: { esm: "js", cjs: "js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("js");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should respect mixed custom extensions", () => {
            const context = createContext({
                node10Compatibility: false,
                emitESM: true,
                emitCJS: true,
                outputExtensionMap: { esm: "js", cjs: "cjs" },
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });
}); 