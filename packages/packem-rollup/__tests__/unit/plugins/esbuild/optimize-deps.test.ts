import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@visulima/find-cache-dir"), () => {
    return {
        findCacheDirSync: vi.fn(),
    };
});

vi.mock(import("esbuild"), () => {
    return {
        build: vi.fn(),
    };
});

vi.mock(import("@visulima/fs"), () => {
    return {
        readFile: vi.fn(),
    };
});

vi.mock(import("rs-module-lexer"), () => {
    return {
        parseAsync: vi.fn(),
    };
});

const { findCacheDirSync } = await import("@visulima/find-cache-dir");
const { build: esbuildBuild } = await import("esbuild");
const { readFile } = await import("@visulima/fs");

const rsModuleLexer = await import("rs-module-lexer");

const { default: optimizeDeps } = await import("../../../../src/plugins/esbuild/utils/optimize-deps");

const CACHE_DIR_ERROR_REGEX = /failed to find or create cache directory/;

describe("esbuild optimizeDeps", () => {
    afterEach(() => {
        vi.mocked(findCacheDirSync).mockReset();
        vi.mocked(esbuildBuild).mockReset();
        vi.mocked(esbuildBuild).mockImplementation(() => ({ errors: [], metafile: { inputs: {}, outputs: {} }, warnings: [] }) as never);
    });

    it("should throw when findCacheDirSync returns undefined (no cache directory available)", async () => {
        expect.assertions(1);

        vi.mocked(findCacheDirSync).mockReturnValueOnce(undefined);

        await expect(optimizeDeps({ cwd: "/virtual/project", include: ["react"], sourceMap: false })).rejects.toThrow(CACHE_DIR_ERROR_REGEX);
    });

    it("should build the optimized Map keyed by each include entry, pointing at <cacheDir>/<id>.js", async () => {
        expect.assertions(3);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache/optimize-deps");

        const result = await optimizeDeps({ cwd: "/virtual/project", include: ["react", "react-dom"], sourceMap: false });

        expect(result.cacheDir).toBe("/cache/optimize-deps");
        expect(result.optimized.get("react")).toStrictEqual({ file: "/cache/optimize-deps/react.js" });
        expect(result.optimized.get("react-dom")).toStrictEqual({ file: "/cache/optimize-deps/react-dom.js" });
    });

    it("should invoke esbuild.build exactly once with the include[] entry points and the optimize-deps plugin", async () => {
        expect.assertions(2);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache/optimize-deps");

        await optimizeDeps({ cwd: "/virtual/project", include: ["lodash-es"], sourceMap: true });

        expect(esbuildBuild).toHaveBeenCalledTimes(1);
        expect(vi.mocked(esbuildBuild).mock.calls[0]?.[0]).toMatchObject({
            absWorkingDir: "/virtual/project",
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
            cwd: "/virtual/project",
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
            cwd: "/virtual/project",
            esbuildOptions: { format: "cjs" },
            include: ["react"],
            sourceMap: false,
        });

        const args = vi.mocked(esbuildBuild).mock.calls[0]?.[0] as { format: string };

        expect(args.format).toBe("cjs");
    });
});

// Helper that captures the inner plugin's `setup(build)` callbacks so we can drive them directly.
type ResolveHandler = (args: {
    path: string;
    pluginData?: unknown;
    resolveDir: string;
}) => Promise<{ errors?: unknown[]; external?: boolean; namespace?: string; path?: string; pluginData?: unknown; warnings?: unknown[] } | null | undefined>;
type LoadHandler = (args: { path: string; pluginData?: unknown }) => Promise<{ contents: string; resolveDir: string } | undefined>;

const captureInnerPluginHandlers = async (options: {
    cwd: string;
    exclude?: string[];
    include: string[];
    sourceMap: boolean;
}): Promise<{
    onLoad: LoadHandler;
    onResolve: ResolveHandler;
    resolveSpy: ReturnType<typeof vi.fn>;
}> => {
    vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache");

    let onResolve: ResolveHandler | undefined;
    let onLoad: LoadHandler | undefined;
    const resolveSpy = vi.fn(() => {
        return { errors: [], path: "/resolved/file.js", warnings: [] };
    });

    vi.mocked(esbuildBuild).mockImplementationOnce(async (buildOptions) => {
        const { plugins } = buildOptions as { plugins: { name: string; setup: (build: unknown) => void | Promise<void> }[] };
        const innerPlugin = plugins.find((p) => p.name === "optimize-deps");

        await innerPlugin?.setup({
            onLoad: (_filter: unknown, handler: LoadHandler) => {
                onLoad = handler;
            },
            onResolve: (_filter: unknown, handler: ResolveHandler) => {
                onResolve = handler;
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
        vi.mocked(esbuildBuild).mockImplementation(() => ({ errors: [], warnings: [] }) as never);
        vi.mocked(readFile).mockReset();
        vi.mocked(rsModuleLexer.parseAsync).mockReset();
    });

    it("should mark a path as external when it is listed in options.exclude", async () => {
        expect.assertions(1);

        const { onResolve } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            exclude: ["lodash-es"],
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "lodash-es", resolveDir: "/virtual" });

        expect(result).toStrictEqual({ external: true });
    });

    it("should short-circuit (return undefined) on the recursive resolve marked with __resolving_dep_path__", async () => {
        expect.assertions(1);

        const { onResolve } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "react", pluginData: { __resolving_dep_path__: true }, resolveDir: "/virtual" });

        expect(result).toBeUndefined();
    });

    it("should redirect an included path into the `optimize-deps` namespace with absolute resolveDir pluginData", async () => {
        expect.assertions(3);

        const { onResolve, resolveSpy } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "react", resolveDir: "/virtual/src" });

        expect(resolveSpy).toHaveBeenCalledWith("react", expect.objectContaining({ kind: "import-statement", resolveDir: "/virtual/src" }));
        expect(result?.namespace).toBe("optimize-deps");
        expect(result?.pluginData).toStrictEqual({ absolute: "/resolved/file.js", resolveDir: "/virtual/src" });
    });

    it("should bubble the inner resolve result when it carries errors or warnings", async () => {
        expect.assertions(1);

        vi.mocked(findCacheDirSync).mockReturnValueOnce("/cache");

        let onResolve: ResolveHandler | undefined;
        const errored = { errors: [{ text: "boom" }], path: "", warnings: [] };

        vi.mocked(esbuildBuild).mockImplementationOnce(async (buildOptions) => {
            const { plugins } = buildOptions as { plugins: { name: string; setup: (build: unknown) => void | Promise<void> }[] };
            const innerPlugin = plugins.find((p) => p.name === "optimize-deps");

            await innerPlugin?.setup({
                onLoad: () => {},
                onResolve: (_filter: unknown, handler: ResolveHandler) => {
                    onResolve = handler;
                },
                resolve: vi.fn(() => errored),
            });

            return { errors: [], warnings: [] } as never;
        });

        await optimizeDeps({ cwd: "/virtual", include: ["react"], sourceMap: false });

        // eslint-disable-next-line vitest/no-conditional-in-test -- narrowing guard before invoking the captured callback
        if (!onResolve) {
            throw new Error("onResolve was not registered");
        }

        const result = await onResolve({ path: "react", resolveDir: "/virtual" });

        expect(result).toStrictEqual(errored);
    });

    it("should pass through (return undefined) when the path is neither excluded nor in include[]", async () => {
        expect.assertions(1);

        const { onResolve } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            include: ["react"],
            sourceMap: false,
        });

        const result = await onResolve({ path: "some-other-dep", resolveDir: "/virtual" });

        expect(result).toBeUndefined();
    });

    it("should emit `export * from \"<absolute>\"` contents for a module that has named exports", async () => {
        expect.assertions(1);

        const { onLoad } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            include: ["react"],
            sourceMap: false,
        });

        vi.mocked(readFile).mockResolvedValueOnce("export const a = 1;");
        vi.mocked(rsModuleLexer.parseAsync).mockResolvedValueOnce({ output: [{ exports: ["a"], filename: "/abs/react.js", imports: [] }] } as never);

        const result = await onLoad({
            path: "react",
            pluginData: { absolute: "/abs/react.js", resolveDir: "/virtual/src" },
        });

        expect(result).toStrictEqual({ contents: "export * from \"/abs/react.js\"", resolveDir: "/virtual/src" });
    });

    it("should emit `module.exports = require(\"<absolute>\")` for a module with no named exports", async () => {
        expect.assertions(1);

        const { onLoad } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            include: ["react"],
            sourceMap: false,
        });

        vi.mocked(readFile).mockResolvedValueOnce("module.exports = 1;");
        vi.mocked(rsModuleLexer.parseAsync).mockResolvedValueOnce({ output: [{ exports: [], filename: "/abs/react.js", imports: [] }] } as never);

        const result = await onLoad({
            path: "react",
            pluginData: { absolute: "/abs/react.js", resolveDir: "/virtual/src" },
        });

        expect(result).toStrictEqual({ contents: "module.exports = require(\"/abs/react.js\")", resolveDir: "/virtual/src" });
    });

    it("should normalize Windows-style backslashes in the absolute path to forward slashes", async () => {
        expect.assertions(1);

        const { onLoad } = await captureInnerPluginHandlers({
            cwd: "/virtual",
            include: ["react"],
            sourceMap: false,
        });

        vi.mocked(readFile).mockResolvedValueOnce("export const a = 1;");
        vi.mocked(rsModuleLexer.parseAsync).mockResolvedValueOnce({
            output: [{ exports: ["a"], filename: String.raw`C:\abs\react.js`, imports: [] }],
        } as never);

        const result = await onLoad({
            path: "react",
            pluginData: { absolute: String.raw`C:\abs\react.js`, resolveDir: String.raw`C:\tmp\src` },
        });

        expect(result?.contents).toBe("export * from \"C:/abs/react.js\"");
    });
});
