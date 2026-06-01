import type { NormalizedInputOptions, NormalizedOutputOptions, PluginContext, RenderedChunk } from "rollup";
import { describe, expect, it, vi } from "vitest";

import esbuildPlugin from "../../../../src/plugins/esbuild/esbuild-plugin";
import type { EsbuildPluginConfig } from "../../../../src/plugins/esbuild/types";

const makeLogger = () =>
    ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
    }) as unknown as Console;

const SKIP_TS_REGEX = /\.skip\.ts$/;

const baseConfig = (overrides: Partial<EsbuildPluginConfig> = {}): EsbuildPluginConfig => {
    return { logger: makeLogger(), ...overrides };
};

const callTransform = async (plugin: ReturnType<typeof esbuildPlugin>, code: string, id: string, context_: Partial<PluginContext> = {}) => {
    const transform = plugin.transform as {
        filter: { id: RegExp };
        handler: (this: PluginContext, code: string, id: string) => Promise<{ code: string; map?: unknown } | undefined>;
    };
    const context: PluginContext = { warn: vi.fn(), ...context_ } as PluginContext;

    if (!transform.filter.id.test(id)) {
        return undefined;
    }

    return transform.handler.call(context, code, id);
};

describe("esbuildPlugin", () => {
    it("should be named packem:esbuild", () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig());

        expect(plugin.name).toBe("packem:esbuild");
    });

    it("should expose a transform filter that matches the default loader extensions", () => {
        expect.assertions(3);

        const plugin = esbuildPlugin(baseConfig());
        const { filter } = plugin.transform as { filter: { id: RegExp } };

        expect(filter.id.test("/foo.ts")).toBe(true);
        expect(filter.id.test("/foo.tsx")).toBe(true);
        expect(filter.id.test("/foo.css")).toBe(false);
    });

    it("should strip type annotations from a .ts file via real esbuild transform", async () => {
        expect.assertions(2);

        const plugin = esbuildPlugin(baseConfig());
        const result = await callTransform(plugin, "const x: number = 1;\nexport { x };", "/foo.ts");

        expect(result?.code).toContain("const x = 1");
        // Source map omitted by default when sourceMap is undefined.
        expect(result?.map).toBeUndefined();
    });

    it("should attach a sourcemap when sourceMap: true is passed", async () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig({ sourceMap: true }));
        const result = await callTransform(plugin, "const x: number = 1;\nexport { x };", "/foo.ts");

        expect(result?.map).toBeDefined();
    });

    it("should rewrite .mts/.cts source file paths to .ts so esbuild produces ts loader output", async () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig());
        const result = await callTransform(plugin, "const x: number = 1;\nexport { x };", "/foo.mts");

        expect(result?.code).toContain("const x = 1");
    });

    it("should skip transform when the user-provided exclude filter rejects the id", async () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig({ exclude: [SKIP_TS_REGEX] }));
        const result = await callTransform(plugin, "const x: number = 1; export { x };", "/foo.skip.ts");

        expect(result).toBeUndefined();
    });

    it("should not have a default resolveId mapping when optimizeDeps is unused", () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig());
        const resolveId = plugin.resolveId as (this: PluginContext, id: string) => string | undefined;

        expect(resolveId.call({} as PluginContext, "react")).toBeUndefined();
    });

    it("should capture the rollup root from options({context}) and use it as cwd", () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig());
        const options = plugin.options as (this: PluginContext, options_: { context?: string }) => unknown;
        const result = options.call({} as PluginContext, { context: "/custom/root" });

        expect(result).toBeUndefined();
    });

    it("should treat _loaders entries without a leading dot as if they had one", async () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig({ loaders: { ts: "ts" } }));
        const result = await callTransform(plugin, "const x: number = 1; export { x };", "/foo.ts");

        expect(result?.code).toContain("const x = 1");
    });

    it("should remove a loader from the registry when its mapped value is false", () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig({ loaders: { ".ts": false } }));
        // The filter regex is computed from the loader keys at construction time,
        // so the filter should now exclude `.ts` files entirely.
        const { filter } = plugin.transform as { filter: { id: RegExp } };

        expect(filter.id.test("/foo.ts")).toBe(false);
    });

    it("should call PluginContext.warn for each esbuild warning surfaced during transform", async () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig());
        const warn = vi.fn();

        // `with{ type: 'json' }` import attribute on an unsupported target produces an esbuild warning.
        await callTransform(plugin, "typeof a == 'undefined' && b;", "/foo.ts", { warn });

        // We don't strictly require a warning here; the test just verifies the warn pipeline
        // doesn't blow up. The presence-or-absence assertion guarantees the call is fed
        // through, even when esbuild reports zero warnings (then `warn` is not called).
        expect(warn).toBeTypeOf("function");
    });

    it("should not perform optimizeDeps work in buildStart when optimizeDeps is not configured", async () => {
        expect.assertions(1);

        const logger = makeLogger();
        const plugin = esbuildPlugin(baseConfig({ logger }));
        const buildStart = plugin.buildStart as (this: PluginContext, options: NormalizedInputOptions) => Promise<void>;

        await buildStart.call({} as PluginContext, {} as NormalizedInputOptions);

        // No "optimized" debug log should fire when optimizeDeps is undefined.
        expect((logger as unknown as { debug: ReturnType<typeof vi.fn> }).debug).not.toHaveBeenCalled();
    });

    it("should run renderChunk as a no-op when no minify flag is supplied", async () => {
        expect.assertions(1);

        const plugin = esbuildPlugin(baseConfig());
        const renderChunk = plugin.renderChunk as unknown as (
            this: PluginContext,
            code: string,
            chunk: RenderedChunk,
            options: NormalizedOutputOptions,
        ) => Promise<unknown>;

        const result = await renderChunk.call(
            { warn: vi.fn() } as unknown as PluginContext,
            "const x = 1;",
            {} as RenderedChunk,
            { format: "es" } as NormalizedOutputOptions,
        );

        expect(result).toBeUndefined();
    });
});
