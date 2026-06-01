import { describe, expect, it } from "vitest";

import {
    alias,
    browserslistToEsbuild,
    chunkSplitter,
    commonjs,
    dynamicImportVars as dynamicImportVariables,
    importTrace,
    inject,
    jsxRemoveAttributes,
    nodeResolve,
    patchErrorWithTrace,
    polyfillNode,
    preserveDirectivesPlugin,
    pureNewExpressionPlugin,
    purePlugin,
    replace,
    visualizer,
    wasm,
} from "../../src/index";

describe("@visulima/packem-rollup public barrel", () => {
    it("should re-export packem-owned plugins", () => {
        expect.assertions(5);

        expect(chunkSplitter).toBeTypeOf("function");
        expect(browserslistToEsbuild).toBeTypeOf("function");
        expect(jsxRemoveAttributes).toBeTypeOf("function");
        expect(preserveDirectivesPlugin).toBeTypeOf("function");
        expect(pureNewExpressionPlugin).toBeTypeOf("function");
    });

    it("should re-export the @rollup ecosystem plugin entry points", () => {
        expect.assertions(8);

        expect(alias).toBeTypeOf("function");
        expect(commonjs).toBeTypeOf("function");
        expect(dynamicImportVariables).toBeTypeOf("function");
        expect(inject).toBeTypeOf("function");
        expect(nodeResolve).toBeTypeOf("function");
        expect(replace).toBeTypeOf("function");
        expect(wasm).toBeTypeOf("function");
        expect(polyfillNode).toBeTypeOf("function");
    });

    it("should re-export the import-trace utilities", () => {
        expect.assertions(2);

        expect(importTrace).toBeTypeOf("function");
        expect(patchErrorWithTrace).toBeTypeOf("function");
    });

    it("should re-export the visualizer and purePlugin", () => {
        expect.assertions(2);

        expect(visualizer).toBeTypeOf("function");
        expect(purePlugin).toBeTypeOf("function");
    });
});
