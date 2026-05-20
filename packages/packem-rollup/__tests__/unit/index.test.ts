import { describe, expect, it } from "vitest";

import * as rollupBackend from "../../src/index";

describe("@visulima/packem-rollup public barrel", () => {
    it("should re-export packem-owned plugins", () => {
        expect.assertions(5);

        expect(rollupBackend.chunkSplitter).toBeTypeOf("function");
        expect(rollupBackend.browserslistToEsbuild).toBeTypeOf("function");
        expect(rollupBackend.jsxRemoveAttributes).toBeTypeOf("function");
        expect(rollupBackend.preserveDirectivesPlugin).toBeTypeOf("function");
        expect(rollupBackend.pureNewExpressionPlugin).toBeTypeOf("function");
    });

    it("should re-export the @rollup ecosystem plugin entry points", () => {
        expect.assertions(8);

        expect(rollupBackend.alias).toBeTypeOf("function");
        expect(rollupBackend.commonjs).toBeTypeOf("function");
        expect(rollupBackend.dynamicImportVars).toBeTypeOf("function");
        expect(rollupBackend.inject).toBeTypeOf("function");
        expect(rollupBackend.nodeResolve).toBeTypeOf("function");
        expect(rollupBackend.replace).toBeTypeOf("function");
        expect(rollupBackend.wasm).toBeTypeOf("function");
        expect(rollupBackend.polyfillNode).toBeTypeOf("function");
    });

    it("should re-export the import-trace utilities", () => {
        expect.assertions(2);

        expect(rollupBackend.importTrace).toBeTypeOf("function");
        expect(rollupBackend.patchErrorWithTrace).toBeTypeOf("function");
    });

    it("should re-export the visualizer and purePlugin", () => {
        expect.assertions(2);

        expect(rollupBackend.visualizer).toBeTypeOf("function");
        expect(rollupBackend.purePlugin).toBeTypeOf("function");
    });
});
