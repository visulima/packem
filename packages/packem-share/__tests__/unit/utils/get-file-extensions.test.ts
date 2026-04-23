import { describe, expect, it } from "vitest";

import type { BuildContext } from "../../../src/types";
import type { FileExtensionOptions } from "../../../src/utils/get-file-extensions";
import { getDtsExtension, getOutputExtension } from "../../../src/utils/get-file-extensions";

// Helper to create a minimal BuildContext for testing
const createOptions = (options: Partial<FileExtensionOptions> = {}): BuildContext<FileExtensionOptions> => {
    return {
        // Required BuildContext properties (minimal for testing)
        buildEntries: [],
        dependencyGraphMap: new Map(),
        environment: undefined,
        hoistedDependencies: new Set(),
        hooks: {} as never,
        implicitDependencies: new Set(),
        jiti: {} as never,
        logger: {} as never,
        mode: "build",
        options: {
            declaration: undefined,
            emitCJS: false,
            emitESM: false,
            outputExtensionMap: undefined,
            ...options,
        },
        pkg: {} as never,
        usedDependencies: new Set(),
        warnings: new Set(),
    };
};

describe(getOutputExtension, () => {
    describe("when outputExtensionMap is provided", () => {
        it("should use outputExtensionMap for ESM", () => {
            expect.assertions(1);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
        });

        it("should use outputExtensionMap for CJS", () => {
            expect.assertions(1);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should use custom extensions from outputExtensionMap", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "js", esm: "js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("js");
        });

        it("should use custom file extensions like c.js and m.js", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "c.js", esm: "m.js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("m.js");
            expect(getOutputExtension(context, "cjs")).toBe("c.js");
        });

        it("should fallback to default when format not in outputExtensionMap", () => {
            expect.assertions(1);

            // Test the fallback behavior by creating a custom context
            const context = createOptions({
                emitCJS: true,
                emitESM: true,
            });

            // Manually set a partial outputExtensionMap to test fallback
            context.options.outputExtensionMap = { esm: "mjs" } as Record<"cjs" | "esm", string>;

            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should handle empty outputExtensionMap", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should prioritize outputExtensionMap over other configurations", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: false,
                emitESM: true,
                outputExtensionMap: { cjs: "custom.js", esm: "custom.mjs" },
            });

            expect(getOutputExtension(context, "esm")).toBe("custom.mjs");
            expect(getOutputExtension(context, "cjs")).toBe("custom.js");
        });
    });

    describe("when declaration is compatible", () => {
        it("should use traditional extensions when emitCJS is true", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: true,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should use traditional extensions when declaration is true", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: true,
                emitCJS: true,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should not use traditional extensions when declaration is node16", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "node16",
                emitCJS: true,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should not use traditional extensions when emitCJS is false", () => {
            expect.assertions(1);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: false,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
        });
    });

    describe("when both ESM and CJS are emitted", () => {
        it("should use traditional extensions for clarity", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should use traditional extensions even when declaration is undefined", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });
    });

    describe("when only one format is emitted", () => {
        it("should use .js for ESM when only ESM is emitted", () => {
            expect.assertions(1);

            const context = createOptions({
                declaration: undefined,
                emitCJS: false,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
        });

        it("should use .js for CJS when only CJS is emitted", () => {
            expect.assertions(1);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: false,
            });

            expect(getOutputExtension(context, "cjs")).toBe("js");
        });

        it("should use .mjs or .cjs when neither format is explicitly emitted", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: false,
                emitESM: false,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });
    });

    describe("edge cases", () => {
        it("should handle undefined options gracefully", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
        });

        it("should handle mixed emit configurations", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: undefined as never,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("js");
        });
    });
});

describe(getDtsExtension, () => {
    describe("when outputExtensionMap is provided", () => {
        it("should derive .d.mts from mjs extension", () => {
            expect.assertions(1);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
        });

        it("should derive .d.cts from cjs extension", () => {
            expect.assertions(1);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "cjs", esm: "mjs" },
            });

            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should derive .d.ts from js extension", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "js", esm: "js" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should handle custom extensions like c.js and m.js", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "c.js", esm: "m.js" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should fallback to traditional extensions when format not in outputExtensionMap", () => {
            expect.assertions(1);

            // Test the fallback behavior by creating a custom context
            const context = createOptions({
                emitCJS: true,
                emitESM: true,
            });

            // Manually set a partial outputExtensionMap to test fallback
            context.options.outputExtensionMap = { esm: "mjs" } as Record<"cjs" | "esm", string>;

            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should use format-based extensions for unknown js extensions when both formats are emitted", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "weird", esm: "unknown" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should fallback to .d.ts for unknown js extensions when only one format is emitted", () => {
            expect.assertions(2);

            const esmOnlyContext = createOptions({
                emitCJS: false,
                emitESM: true,
                outputExtensionMap: { cjs: "weird", esm: "unknown" },
            });

            const cjsOnlyContext = createOptions({
                emitCJS: true,
                emitESM: false,
                outputExtensionMap: { cjs: "weird", esm: "unknown" },
            });

            expect(getDtsExtension(esmOnlyContext, "esm")).toBe("d.ts");
            expect(getDtsExtension(cjsOnlyContext, "cjs")).toBe("d.ts");
        });

        it("should handle empty outputExtensionMap", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should prioritize outputExtensionMap over other configurations", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: false,
                emitESM: true,
                outputExtensionMap: { cjs: "js", esm: "mjs" },
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });
    });

    describe("when declaration is compatible", () => {
        it("should use traditional extensions when emitCJS is true", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should use traditional extensions when declaration is true", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: true,
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should not use traditional extensions when declaration is node16", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "node16",
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should not use traditional extensions when emitCJS is false", () => {
            expect.assertions(1);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: false,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
        });
    });

    describe("when both ESM and CJS are emitted", () => {
        it("should use traditional extensions for clarity", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should use traditional extensions even when declaration is undefined", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });

    describe("when only one format is emitted", () => {
        it("should use .d.ts for ESM when only ESM is emitted", () => {
            expect.assertions(1);

            const context = createOptions({
                declaration: undefined,
                emitCJS: false,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
        });

        it("should use .d.ts for CJS when only CJS is emitted", () => {
            expect.assertions(1);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: false,
            });

            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should use .d.ts when neither format is explicitly emitted", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: false,
                emitESM: false,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });
    });

    describe("edge cases", () => {
        it("should handle undefined options gracefully", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should handle mixed emit configurations", () => {
            expect.assertions(2);

            const context = createOptions({
                emitCJS: true,
                emitESM: undefined as never,
            });

            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should handle various declaration values", () => {
            expect.assertions(4);

            // Test with compatible declaration
            const compatibleContext = createOptions({
                declaration: "compatible",
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(compatibleContext, "esm")).toBe("d.mts");
            expect(getDtsExtension(compatibleContext, "cjs")).toBe("d.cts");

            // Test with node16 declaration
            const node16Context = createOptions({
                declaration: "node16",
                emitCJS: true,
                emitESM: true,
            });

            expect(getDtsExtension(node16Context, "esm")).toBe("d.mts");
            expect(getDtsExtension(node16Context, "cjs")).toBe("d.cts");
        });
    });

    describe("mapJsExtensionToDts internal logic", () => {
        it("should map standard JavaScript extensions correctly", () => {
            expect.assertions(6);

            const testCases = [
                { expected: { cjs: "d.cts", esm: "d.mts" }, input: { cjs: "cjs", esm: "mjs" } },
                { expected: { cjs: "d.ts", esm: "d.ts" }, input: { cjs: "js", esm: "js" } },
                { expected: { cjs: "d.cts", esm: "d.ts" }, input: { cjs: "cjs", esm: "js" } },
            ];

            for (const { expected, input } of testCases) {
                const context = createOptions({
                    outputExtensionMap: input,
                });

                expect(getDtsExtension(context, "esm")).toBe(expected.esm);
                expect(getDtsExtension(context, "cjs")).toBe(expected.cjs);
            }
        });

        it("should default to .d.ts for unknown extensions", () => {
            expect.assertions(4);

            const unknownExtensions = ["unknown", "weird", "custom", "abc"];

            for (const extension of unknownExtensions) {
                const context = createOptions({
                    outputExtensionMap: { cjs: extension, esm: extension },
                });

                expect(getDtsExtension(context, "esm")).toBe("d.ts");
            }
        });
    });
});

describe("integration scenarios", () => {
    describe("modern single-format libraries", () => {
        it("should use .js/.d.ts for ESM-only modern library", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: false,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
        });

        it("should use .js/.d.ts for CJS-only modern library", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: false,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "cjs")).toBe("js");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });
    });

    describe("dual-format libraries", () => {
        it("should use traditional extensions for dual-format library", () => {
            expect.assertions(4);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should handle dual-format with mixed configurations", () => {
            expect.assertions(12);

            const configurations = [
                { declaration: undefined, emitCJS: true, emitESM: true },
                { declaration: false, emitCJS: true, emitESM: true },
                { declaration: "node16" as const, emitCJS: true, emitESM: true },
            ];

            for (const config of configurations) {
                const context = createOptions(config);

                expect(getOutputExtension(context, "esm")).toBe("mjs");
                expect(getOutputExtension(context, "cjs")).toBe("cjs");
                expect(getDtsExtension(context, "esm")).toBe("d.mts");
                expect(getDtsExtension(context, "cjs")).toBe("d.cts");
            }
        });
    });

    describe("compatible declaration mode", () => {
        it("should use traditional extensions when emitCJS and declaration is compatible", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: "compatible",
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
        });

        it("should use traditional extensions when declaration is true", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: true,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
        });
    });

    describe("custom extension mapping", () => {
        it("should respect custom .js mapping for all formats", () => {
            expect.assertions(4);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "js", esm: "js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("js");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should respect mixed custom extensions", () => {
            expect.assertions(4);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "cjs", esm: "js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should handle complex custom extensions like c.js and m.js", () => {
            expect.assertions(4);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "c.js", esm: "m.js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("m.js");
            expect(getOutputExtension(context, "cjs")).toBe("c.js");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });

    describe("real-world scenarios", () => {
        it("should handle Node.js package with dual exports", () => {
            expect.assertions(4);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("mjs");
            expect(getOutputExtension(context, "cjs")).toBe("cjs");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });

        it("should handle modern ESM-only package", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: false,
                emitESM: true,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "esm")).toBe("js");
            expect(getDtsExtension(context, "esm")).toBe("d.ts");
        });

        it("should handle legacy CJS-only package", () => {
            expect.assertions(2);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: false,
                outputExtensionMap: undefined,
            });

            expect(getOutputExtension(context, "cjs")).toBe("js");
            expect(getDtsExtension(context, "cjs")).toBe("d.ts");
        });

        it("should handle package with custom build output extensions", () => {
            expect.assertions(4);

            const context = createOptions({
                declaration: undefined,
                emitCJS: true,
                emitESM: true,
                outputExtensionMap: { cjs: "c.js", esm: "m.js" },
            });

            expect(getOutputExtension(context, "esm")).toBe("m.js");
            expect(getOutputExtension(context, "cjs")).toBe("c.js");
            expect(getDtsExtension(context, "esm")).toBe("d.mts");
            expect(getDtsExtension(context, "cjs")).toBe("d.cts");
        });
    });
});
