import type { NormalizedOutputOptions, PluginContext, RenderedChunk } from "rollup";
import { describe, expect, it, vi } from "vitest";

import getRenderChunk from "../../../../src/plugins/esbuild/utils/get-render-chunk";

const callRenderChunk = (
    renderChunk: ReturnType<typeof getRenderChunk>,
    code: string,
    options: Partial<NormalizedOutputOptions>,
    ctx: Partial<PluginContext> = {},
) => {
    const handler = renderChunk as unknown as (
        this: PluginContext,
        code: string,
        chunk: RenderedChunk,
        options: NormalizedOutputOptions,
    ) => Promise<{ code: string; map: unknown } | undefined>;
    const context: PluginContext = { warn: vi.fn(), ...ctx } as PluginContext;

    return handler.call(context, code, {} as RenderedChunk, options as NormalizedOutputOptions);
};

describe("getRenderChunk", () => {
    it("should be a no-op when no minify-related flag is set", async () => {
        expect.assertions(1);

        const renderChunk = getRenderChunk({});
        const result = await callRenderChunk(renderChunk, "const x = 1;", { format: "es" });

        expect(result).toBeUndefined();
    });

    it("should minify when minify: true and produce a sourcemap by default", async () => {
        expect.assertions(2);

        const renderChunk = getRenderChunk({ minify: true });
        const result = await callRenderChunk(renderChunk, "const longName = 1; console.log(longName);", { format: "es" });

        expect(result?.code).toBeDefined();
        expect(result?.map).toBeDefined();
    });

    it("should omit the sourcemap when sourceMap is false", async () => {
        expect.assertions(2);

        const renderChunk = getRenderChunk({ minify: true, sourceMap: false });
        const result = await callRenderChunk(renderChunk, "const longName = 1; console.log(longName);", { format: "es" });

        expect(result?.code).toBeDefined();
        expect(result?.map).toBeUndefined();
    });

    it("should treat rollup `cjs` format as esbuild `cjs`", async () => {
        expect.assertions(1);

        const renderChunk = getRenderChunk({ minify: true });
        const result = await callRenderChunk(renderChunk, "module.exports.x = 1;", { format: "cjs" });

        expect(result?.code).toBeDefined();
    });

    it("should pass minifyWhitespace through", async () => {
        expect.assertions(1);

        const renderChunk = getRenderChunk({ minifyWhitespace: true });
        const result = await callRenderChunk(renderChunk, "const x = 1;    const y = 2;", { format: "es" });

        expect(result?.code).toBeDefined();
    });

    it("should trigger esbuild on minifyIdentifiers: true", async () => {
        expect.assertions(1);

        const renderChunk = getRenderChunk({ minifyIdentifiers: true });
        const result = await callRenderChunk(renderChunk, "function aReallyLongName() { return 1; } aReallyLongName();", { format: "es" });

        expect(result?.code).toBeDefined();
    });

    it("should trigger esbuild on minifySyntax: true", async () => {
        expect.assertions(1);

        const renderChunk = getRenderChunk({ minifySyntax: true });
        const result = await callRenderChunk(renderChunk, "if (true) { console.log(1); }", { format: "es" });

        expect(result?.code).toBeDefined();
    });

    it("should pass an undefined esbuild format when the rollup format is neither `es` nor `cjs`", async () => {
        expect.assertions(1);

        // iife is supported by rollup but not by esbuild's `transform` format option,
        // so getEsbuildFormat returns undefined — esbuild then defaults the format.
        const renderChunk = getRenderChunk({ minify: true });
        const result = await callRenderChunk(renderChunk, "const x = 1; console.log(x);", { format: "iife" });

        expect(result?.code).toBeDefined();
    });
});
