import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@visulima/find-cache-dir", () => ({
    findCacheDirSync: vi.fn(),
}));

vi.mock("esbuild", () => ({
    build: vi.fn(async () => ({ metafile: { inputs: {}, outputs: {} } })),
}));

vi.mock("@visulima/fs", () => ({
    readFileSync: vi.fn(),
}));

vi.mock("rs-module-lexer", () => ({
    parseAsync: vi.fn(),
}));

const { findCacheDirSync } = await import("@visulima/find-cache-dir");
const { build: esbuildBuild } = await import("esbuild");
const { readFileSync } = await import("@visulima/fs");
// eslint-disable-next-line import/no-namespace
const rsModuleLexer = await import("rs-module-lexer");

const optimizeDeps = (await import("../../../../src/plugins/esbuild/utils/optimize-deps")).default;

describe("esbuild optimizeDeps", () => {
    afterEach(() => {
        vi.mocked(findCacheDirSync).mockReset();
        vi.mocked(esbuildBuild).mockReset();
        vi.mocked(esbuildBuild).mockImplementation(async () => ({ errors: [], metafile: { inputs: {}, outputs: {} }, warnings: [] }) as never);
    });

    it("should throw when findCacheDirSync returns undefined (no cache directory available)", async () => {
        expect.assertions(1);

        vi.mocked(findCacheDirSync).mockReturnValueOnce(undefined);

        await expect(
            optimizeDeps({ cwd: "/tmp/project", include: ["react"], sourceMap: false }),
        ).rejects.toThrow(/failed to find or create cache directory/);
    });

    it("should build the optimized Map keyed by each include entry, pointing at <cacheDir>/<id>.js", async () => {
        expect.assertions(3);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache/optimize-deps");

        const result = await optimizeDeps({ cwd: "/tmp/project", include: ["react", "react-dom"], sourceMap: false });

        expect(result.cacheDir).toBe("/cache/optimize-deps");
        expect(result.optimized.get("react")).toEqual({ file: "/cache/optimize-deps/react.js" });
        expect(result.optimized.get("react-dom")).toEqual({ file: "/cache/optimize-deps/react-dom.js" });
    });

    it("should invoke esbuild.build exactly once with the include[] entry points and the optimize-deps plugin", async () => {
        expect.assertions(2);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache/optimize-deps");

        await optimizeDeps({ cwd: "/tmp/project", include: ["lodash-es"], sourceMap: true });

        expect(esbuildBuild).toHaveBeenCalledTimes(1);
        expect(vi.mocked(esbuildBuild).mock.calls[0]?.[0]).toMatchObject({
            absWorkingDir: "/tmp/project",
            bundle: true,
            entryPoints: ["lodash-es"],
            format: "esm",
            outdir: "/cache/optimize-deps",
            sourcemap: true,
            splitting: true,
        });
    });

    it("should append user-supplied esbuildOptions.plugins after the internal optimize-deps plugin", async () => {
        expect.assertions(2);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache/optimize-deps");

        const userPlugin = { name: "user:custom", setup() {} };

        await optimizeDeps({
            cwd: "/tmp/project",
            esbuildOptions: { plugins: [userPlugin] },
            include: ["react"],
            sourceMap: false,
        });

        const args = vi.mocked(esbuildBuild).mock.calls[0]?.[0] as { plugins: { name: string }[] };

        expect(args.plugins[0]?.name).toBe("optimize-deps");
        expect(args.plugins[1]).toBe(userPlugin);
    });

    it("should let user-supplied esbuildOptions override the defaults via spread order", async () => {
        expect.assertions(1);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache/optimize-deps");

        await optimizeDeps({
            cwd: "/tmp/project",
            esbuildOptions: { format: "cjs" },
            include: ["react"],
            sourceMap: false,
        });

        const args = vi.mocked(esbuildBuild).mock.calls[0]?.[0] as { format: string };

        expect(args.format).toBe("cjs");
    });
});

// Helper that captures the inner plugin's `setup(build)` callbacks so we can drive them directly.
type ResolveHandler = (args: { path: string; pluginData?: unknown; resolveDir: string }) => Promise<{ external?: boolean; namespace?: string; path?: string; pluginData?: unknown; errors?: unknown[]; warnings?: unknown[] } | null | undefined>;
type LoadHandler = (args: { path: string; pluginData?: unknown }) => Promise<{ contents: string; resolveDir: string } | undefined>;

const captureInnerPluginHandlers = async (options: { cwd: string; exclude?: string[]; include: string[]; sourceMap: boolean }): Promise<{
    onResolve: ResolveHandler;
    onLoad: LoadHandler;
    resolveSpy: ReturnType<typeof vi.fn>;
}> => {
    vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache");

    let onResolve: ResolveHandler | undefined;
    let onLoad: LoadHandler | undefined;
    const resolveSpy = vi.fn(async () => ({ errors: [], path: "/resolved/file.js", warnings: [] }));

    vi.mocked(esbuildBuild).mockImplementationOnce(async (buildOptions) => {
        const plugins = (buildOptions as { plugins: { name: string; setup: (build: unknown) => void | Promise<void> }[] }).plugins;
        const innerPlugin = plugins.find((p) => p.name === "optimize-deps");

        await innerPlugin?.setup({
            onResolve: (_filter: unknown, handler: ResolveHandler) => {
                onResolve = handler;
            },
            onLoad: (_filter: unknown, handler: LoadHandler) => {
                onLoad = handler;
            },
            resolve: resolveSpy,
        });

        return { errors: [], warnings: [] } as never;
    });

    await optimizeDeps(options);

    if (!onResolve || !onLoad) {
        throw new Error("inner plugin setup did not register both onResolve and onLoad");
    }

    return { onLoad, onResolve, resolveSpy };
};

describe("esbuild optimizeDeps — internal plugin callbacks", () => {
    afterEach(() => {
        vi.mocked(findCacheDirSync).mockReset();
        vi.mocked(esbuildBuild).mockReset();
        vi.mocked(esbuildBuild).mockImplementation(async () => ({ errors: [], warnings: [] }) as never);
        vi.mocked(readFileSync).mockReset();
        vi.mocked(rsModuleLexer.parseAsync).mockReset();
    });

    it("should mark a path as external when it is listed in options.exclude", async () => {
        expect.assertions(1);

        const { onResolve } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            exclude: ["lodash-es"],
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "lodash-es", resolveDir: "/tmp" });

        expect(result).toEqual({ external: true });
    });

    it("should short-circuit (return undefined) on the recursive resolve marked with __resolving_dep_path__", async () => {
        expect.assertions(1);

        const { onResolve } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "react", pluginData: { __resolving_dep_path__: true }, resolveDir: "/tmp" });

        expect(result).toBeUndefined();
    });

    it("should redirect an included path into the `optimize-deps` namespace with absolute resolveDir pluginData", async () => {
        expect.assertions(3);

        const { onResolve, resolveSpy } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "react", resolveDir: "/tmp/src" });

        expect(resolveSpy).toHaveBeenCalledWith(
            "react",
            expect.objectContaining({ kind: "import-statement", resolveDir: "/tmp/src" }),
        );
        expect(result?.namespace).toBe("optimize-deps");
        expect(result?.pluginData).toEqual({ absolute: "/resolved/file.js", resolveDir: "/tmp/src" });
    });

    it("should bubble the inner resolve result when it carries errors or warnings", async () => {
        expect.assertions(1);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache");

        let onResolve: ResolveHandler | undefined;
        const errored = { errors: [{ text: "boom" }], path: "", warnings: [] };

        vi.mocked(esbuildBuild).mockImplementationOnce(async (buildOptions) => {
            const plugins = (buildOptions as { plugins: { name: string; setup: (build: unknown) => void | Promise<void> }[] }).plugins;
            const innerPlugin = plugins.find((p) => p.name === "optimize-deps");

            await innerPlugin?.setup({
                onLoad: () => {},
                onResolve: (_filter: unknown, handler: ResolveHandler) => {
                    onResolve = handler;
                },
                resolve: vi.fn(async () => errored),
            });

            return { errors: [], warnings: [] } as never;
        });

        await optimizeDeps({ cwd: "/tmp", include: ["react"], sourceMap: false });

        const result = await onResolve!({ path: "react", resolveDir: "/tmp" });

        expect(result).toEqual(errored);
    });

    it("should pass through (return undefined) when the path is neither excluded nor in include[]", async () => {
        expect.assertions(1);

        const { onResolve } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "some-other-dep", resolveDir: "/tmp" });

        expect(result).toBeUndefined();
    });

    it("should emit `export * from '<absolute>'` contents for a module that has named exports", async () => {
        expect.assertions(1);

        const { onLoad } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            include: ["react"],
            sourceMap: false,
        });

        vi.mocked(readFileSync).mockReturnValueOnce("export const a = 1;");
        vi.mocked(rsModuleLexer.parseAsync).mockResolvedValueOnce({ output: [{ exports: ["a"], filename: "/abs/react.js", imports: [] }] } as never);

        const result = await onLoad({
            path: "react",
            pluginData: { absolute: "/abs/react.js", resolveDir: "/tmp/src" },
        });

        expect(result).toEqual({ contents: "export * from '/abs/react.js'", resolveDir: "/tmp/src" });
    });

    it("should emit `module.exports = require('<absolute>')` for a module with no named exports", async () => {
        expect.assertions(1);

        const { onLoad } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            include: ["react"],
            sourceMap: false,
        });

        vi.mocked(readFileSync).mockReturnValueOnce("module.exports = 1;");
        vi.mocked(rsModuleLexer.parseAsync).mockResolvedValueOnce({ output: [{ exports: [], filename: "/abs/react.js", imports: [] }] } as never);

        const result = await onLoad({
            path: "react",
            pluginData: { absolute: "/abs/react.js", resolveDir: "/tmp/src" },
        });

        expect(result).toEqual({ contents: "module.exports = require('/abs/react.js')", resolveDir: "/tmp/src" });
    });

    it("should normalize Windows-style backslashes in the absolute path to forward slashes", async () => {
        expect.assertions(1);

        const { onLoad } = await captureInnerPluginHandlers({
            cwd: "/tmp",
            include: ["react"],
            sourceMap: false,
        });

        vi.mocked(readFileSync).mockReturnValueOnce("export const a = 1;");
        vi.mocked(rsModuleLexer.parseAsync).mockResolvedValueOnce({ output: [{ exports: ["a"], filename: "C:\\abs\\react.js", imports: [] }] } as never);

        const result = await onLoad({
            path: "react",
            pluginData: { absolute: "C:\\abs\\react.js", resolveDir: "C:\\tmp\\src" },
        });

        expect(result?.contents).toBe("export * from 'C:/abs/react.js'");
    });
});
