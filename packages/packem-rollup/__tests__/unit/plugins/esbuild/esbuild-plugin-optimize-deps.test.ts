import type { NormalizedInputOptions, PluginContext } from "rollup";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("../../../../src/plugins/esbuild/utils/optimize-deps"), () => {
    return {
        default: vi.fn(),
    };
});

// eslint-disable-next-line import/first
import esbuildPlugin from "../../../../src/plugins/esbuild/esbuild-plugin";
// eslint-disable-next-line import/first
import type { OptimizeDepsResult } from "../../../../src/plugins/esbuild/types";
// eslint-disable-next-line import/first
import doOptimizeDeps from "../../../../src/plugins/esbuild/utils/optimize-deps";

const makeLogger = () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() }) as unknown as Console;

const AS_DEFAULT_REGEX = /as default/;

const primeOptimizeDeps = async (plugin: ReturnType<typeof esbuildPlugin>) => {
    const buildStart = plugin.buildStart as (this: PluginContext, options: NormalizedInputOptions) => Promise<void>;

    await buildStart.call({} as PluginContext, {} as NormalizedInputOptions);
};

describe("esbuildPlugin — optimizeDeps integration", () => {
    beforeEach(() => {
        vi.mocked(doOptimizeDeps).mockReset();
    });

    it("should invoke doOptimizeDeps from buildStart and emit a `optimized` debug log", async () => {
        expect.assertions(3);

        const optimized: OptimizeDepsResult = {
            cacheDir: "/cache",
            optimized: new Map([["react", { file: "/cache/react.js" }]]),
        };

        vi.mocked(doOptimizeDeps).mockResolvedValueOnce(optimized);

        const logger = makeLogger();
        const plugin = esbuildPlugin({
            logger,
            optimizeDeps: { include: ["react"] },
        });

        await primeOptimizeDeps(plugin);

        expect(doOptimizeDeps).toHaveBeenCalledTimes(1);
        expect(vi.mocked(doOptimizeDeps).mock.calls[0]?.[0]).toMatchObject({ include: ["react"] });
        expect((logger as unknown as { debug: ReturnType<typeof vi.fn> }).debug).toHaveBeenCalledWith("optimized %O", optimized.optimized);
    });

    it("should not call doOptimizeDeps a second time after the first buildStart populates the result", async () => {
        expect.assertions(1);

        vi.mocked(doOptimizeDeps).mockResolvedValue({
            cacheDir: "/cache",
            optimized: new Map([["react", { file: "/cache/react.js" }]]),
        });

        const plugin = esbuildPlugin({
            logger: makeLogger(),
            optimizeDeps: { include: ["react"] },
        });

        await primeOptimizeDeps(plugin);
        await primeOptimizeDeps(plugin);

        expect(doOptimizeDeps).toHaveBeenCalledTimes(1);
    });

    it("should resolveId(id) to the cached file path for an optimized id", async () => {
        expect.assertions(1);

        vi.mocked(doOptimizeDeps).mockResolvedValueOnce({
            cacheDir: "/cache",
            optimized: new Map([["lodash-es", { file: "/cache/lodash-es.js" }]]),
        });

        const plugin = esbuildPlugin({
            logger: makeLogger(),
            optimizeDeps: { include: ["lodash-es"] },
        });

        await primeOptimizeDeps(plugin);

        const resolveId = plugin.resolveId as (this: PluginContext, id: string) => string | undefined;

        expect(resolveId.call({} as PluginContext, "lodash-es")).toBe("/cache/lodash-es.js");
    });

    it("should return undefined from resolveId for ids that were not optimized", async () => {
        expect.assertions(1);

        vi.mocked(doOptimizeDeps).mockResolvedValueOnce({
            cacheDir: "/cache",
            optimized: new Map([["lodash-es", { file: "/cache/lodash-es.js" }]]),
        });

        const plugin = esbuildPlugin({
            logger: makeLogger(),
            optimizeDeps: { include: ["lodash-es"] },
        });

        await primeOptimizeDeps(plugin);

        const resolveId = plugin.resolveId as (this: PluginContext, id: string) => string | undefined;

        expect(resolveId.call({} as PluginContext, "not-optimized")).toBeUndefined();
    });

    it("should short-circuit transform for ids that resolved via the optimize-deps cache", async () => {
        expect.assertions(1);

        vi.mocked(doOptimizeDeps).mockResolvedValueOnce({
            cacheDir: "/cache",
            optimized: new Map([["/foo.ts", { file: "/cache/foo.js" }]]),
        });

        const plugin = esbuildPlugin({
            logger: makeLogger(),
            optimizeDeps: { include: ["/foo.ts"] },
        });

        await primeOptimizeDeps(plugin);

        const transform = plugin.transform as {
            handler: (this: PluginContext, code: string, id: string) => Promise<unknown>;
        };
        const result = await transform.handler.call({ warn: vi.fn() } as unknown as PluginContext, "const x = 1; export { x };", "/foo.ts");

        expect(result).toBeUndefined();
    });

    it("should pass the binary/json loader through to esbuild with format `esm`", async () => {
        // The plugin sets `format: "esm"` for binary-like loaders (base64/binary/dataurl/text/json).
        // Verified indirectly: json loader + format=esm emits a real ESM module that re-exports `default`,
        // proving (a) the loader took effect and (b) the esm format was honored.
        expect.assertions(2);

        const plugin = esbuildPlugin({
            loaders: { ".json": "json" },
            logger: makeLogger(),
        });

        const transform = plugin.transform as {
            handler: (this: PluginContext, code: string, id: string) => Promise<{ code: string } | undefined>;
        };

        const result = await transform.handler.call({ warn: vi.fn() } as unknown as PluginContext, "{ \"hello\": 1 }", "/data.json");

        expect(result?.code).toMatch(AS_DEFAULT_REGEX);
        expect(result?.code).toContain("export {");
    });
});
