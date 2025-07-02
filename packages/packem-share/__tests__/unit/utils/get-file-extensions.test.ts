import { describe, expect, it } from "vitest";

import type { FileExtensionOptions } from "../../../src/utils/get-file-extensions";
import { getDtsExtension, getOutputExtension } from "../../../src/utils/get-file-extensions";

// Helper to create a minimal FileExtensionOptions for testing
const createOptions = (options: Partial<FileExtensionOptions> = {}): FileExtensionOptions => ({
    // Default options
    emitCJS: true,
    emitESM: true,
    declaration: undefined,
    outputExtensionMap: undefined,
    ...options,
});

describe(getOutputExtension, () => {
    describe("when outputExtensionMap is provided", () => {
        it("should use outputExtensionMap for ESM", () => {
            expect.assertions(1);

            const options = createOptions({
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getOutputExtension(options, "esm")).toBe("mjs");
        });

        it("should use outputExtensionMap for CJS", () => {
            expect.assertions(1);

            const options = createOptions({
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getOutputExtension(options, "cjs")).toBe("cjs");
        });

        it("should use custom extensions from outputExtensionMap", () => {
            expect.assertions(2);

            const options = createOptions({
                outputExtensionMap: { cjs: "js", esm: "js" },
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
            expect(getOutputExtension(options, "cjs")).toBe("js");
        });

        it("should fallback to default when format not in outputExtensionMap", () => {
            expect.assertions(1);

            const options = createOptions({
                outputExtensionMap: { esm: "mjs" }, // missing cjs
            });

            expect(getOutputExtension(options, "cjs")).toBe("cjs");
        });
    });

    describe("when emitCJS and declaration is compatible", () => {
        it("should use traditional extensions", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: "compatible",
            });

            expect(getOutputExtension(options, "esm")).toBe("mjs");
            expect(getOutputExtension(options, "cjs")).toBe("cjs");
        });

        it("should not use traditional extensions when declaration is not compatible", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: "node16",
            });

            expect(getOutputExtension(options, "esm")).toBe("mjs");
            expect(getOutputExtension(options, "cjs")).toBe("cjs");
        });

        it("should not use traditional extensions when emitCJS is false", () => {
            expect.assertions(1);

            const options = createOptions({
                emitCJS: false,
                emitESM: true,
                declaration: "compatible",
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
        });
    });

    describe("when both ESM and CJS are emitted", () => {
        it("should use traditional extensions for clarity", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: undefined,
            });

            expect(getOutputExtension(options, "esm")).toBe("mjs");
            expect(getOutputExtension(options, "cjs")).toBe("cjs");
        });
    });

    describe("when only one format is emitted", () => {
        it("should use .js for ESM when only ESM is emitted", () => {
            expect.assertions(1);

            const options = createOptions({
                emitCJS: false,
                emitESM: true,
                declaration: undefined,
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
        });

        it("should use .js for CJS when only CJS is emitted", () => {
            expect.assertions(1);

            const options = createOptions({
                emitCJS: true,
                emitESM: false,
                declaration: undefined,
            });

            expect(getOutputExtension(options, "cjs")).toBe("js");
        });

        it("should use .js when neither format is explicitly emitted", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: false,
                emitESM: false,
                declaration: undefined,
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
            expect(getOutputExtension(options, "cjs")).toBe("js");
        });
    });
});

describe(getDtsExtension, () => {
    describe("when outputExtensionMap is provided", () => {
        it("should derive .d.mts from mjs extension", () => {
            expect.assertions(1);

            const options = createOptions({
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getDtsExtension(options, "esm")).toBe("d.mts");
        });

        it("should derive .d.cts from cjs extension", () => {
            expect.assertions(1);

            const options = createOptions({
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });

        it("should derive .d.ts from js extension", () => {
            expect.assertions(2);

            const options = createOptions({
                outputExtensionMap: { cjs: "js", esm: "js" },
            });

            expect(getDtsExtension(options, "esm")).toBe("d.ts");
            expect(getDtsExtension(options, "cjs")).toBe("d.ts");
        });

        it("should fallback to traditional extensions when format not in outputExtensionMap", () => {
            expect.assertions(1);

            const options = createOptions({
                outputExtensionMap: { esm: "mjs" }, // missing cjs
            });

            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });

        it("should fallback to .d.ts for unknown js extension", () => {
            expect.assertions(2);

            const options = createOptions({
                outputExtensionMap: { cjs: "weird", esm: "unknown" },
            });

            expect(getDtsExtension(options, "esm")).toBe("d.ts");
            expect(getDtsExtension(options, "cjs")).toBe("d.ts");
        });

        it("should handle empty outputExtensionMap", () => {
            expect.assertions(2);

            const options = createOptions({
                outputExtensionMap: {},
            });

            expect(getDtsExtension(options, "esm")).toBe("d.mts");
            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });
    });

    describe("when emitCJS and declaration is compatible", () => {
        it("should use traditional extensions", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: "compatible",
            });

            expect(getDtsExtension(options, "esm")).toBe("d.mts");
            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });

        it("should not use traditional extensions when declaration is not compatible", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: "node16",
            });

            expect(getDtsExtension(options, "esm")).toBe("d.mts");
            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });

        it("should not use traditional extensions when emitCJS is false", () => {
            expect.assertions(1);

            const options = createOptions({
                emitCJS: false,
                emitESM: true,
                declaration: "compatible",
            });

            expect(getDtsExtension(options, "esm")).toBe("d.ts");
        });
    });

    describe("when both ESM and CJS are emitted", () => {
        it("should use traditional extensions for clarity", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: undefined,
            });

            expect(getDtsExtension(options, "esm")).toBe("d.mts");
            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });
    });

    describe("when only one format is emitted", () => {
        it("should use .d.ts for ESM when only ESM is emitted", () => {
            expect.assertions(1);

            const options = createOptions({
                emitCJS: false,
                emitESM: true,
                declaration: undefined,
            });

            expect(getDtsExtension(options, "esm")).toBe("d.ts");
        });

        it("should use .d.ts for CJS when only CJS is emitted", () => {
            expect.assertions(1);

            const options = createOptions({
                emitCJS: true,
                emitESM: false,
                declaration: undefined,
            });

            expect(getDtsExtension(options, "cjs")).toBe("d.ts");
        });

        it("should use .d.ts when neither format is explicitly emitted", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: false,
                emitESM: false,
                declaration: undefined,
            });

            expect(getDtsExtension(options, "esm")).toBe("d.ts");
            expect(getDtsExtension(options, "cjs")).toBe("d.ts");
        });
    });
});

describe("integration scenarios", () => {
    describe("modern single-format libraries", () => {
        it("should use .js/.d.ts for ESM-only modern library", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: false,
                emitESM: true,
                declaration: undefined,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
            expect(getDtsExtension(options, "esm")).toBe("d.ts");
        });

        it("should use .js/.d.ts for CJS-only modern library", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: false,
                declaration: undefined,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(options, "cjs")).toBe("js");
            expect(getDtsExtension(options, "cjs")).toBe("d.ts");
        });
    });

    describe("dual-format libraries", () => {
        it("should use traditional extensions for dual-format library", () => {
            expect.assertions(4);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: undefined,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(options, "esm")).toBe("mjs");
            expect(getOutputExtension(options, "cjs")).toBe("cjs");
            expect(getDtsExtension(options, "esm")).toBe("d.mts");
            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });
    });

    describe("compatible declaration mode", () => {
        it("should use traditional extensions when emitCJS and declaration is compatible", () => {
            expect.assertions(2);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: "compatible",
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(options, "esm")).toBe("mjs");
            expect(getDtsExtension(options, "esm")).toBe("d.mts");
        });
    });

    describe("custom extension mapping", () => {
        it("should respect custom .js mapping for all formats", () => {
            expect.assertions(4);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: undefined,
                outputExtensionMap: { cjs: "js", esm: "js" },
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
            expect(getOutputExtension(options, "cjs")).toBe("js");
            expect(getDtsExtension(options, "esm")).toBe("d.ts");
            expect(getDtsExtension(options, "cjs")).toBe("d.ts");
        });

        it("should respect mixed custom extensions", () => {
            expect.assertions(4);

            const options = createOptions({
                emitCJS: true,
                emitESM: true,
                declaration: undefined,
                outputExtensionMap: { cjs: "cjs", esm: "js" },
            });

            expect(getOutputExtension(options, "esm")).toBe("js");
            expect(getOutputExtension(options, "cjs")).toBe("cjs");
            expect(getDtsExtension(options, "esm")).toBe("d.ts");
            expect(getDtsExtension(options, "cjs")).toBe("d.cts");
        });
    });
}); 