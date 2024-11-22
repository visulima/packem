import type { PackageJson } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import type { TsConfigResult } from "@visulima/tsconfig";
import { describe, expect, it, vi } from "vitest";

import type { ResolveExternalsPluginOptions } from "../../../../src/rollup/plugins/resolve-externals-plugin";
import { resolveExternalsPlugin } from "../../../../src/rollup/plugins/resolve-externals-plugin";
import type { InternalBuildOptions } from "../../../../src/types";
import { MockPluginContext } from "../../../helpers";

const mockedLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
} as unknown as Pail;

const defaultPluginConfig: ResolveExternalsPluginOptions = {
    builtins: true,
    builtinsPrefix: "add",
    deps: true,
    devDeps: false,
    exclude: [],
    optDeps: true,
    peerDeps: true,
};

describe("resolve-externals-plugin", () => {
    const getMockPluginContext = ({
        buildOptions,
        logger = mockedLogger,
        options,
        packageJson,
        tsconfig = undefined,
    }: {
        buildOptions?: Partial<InternalBuildOptions>;
        logger?: Pail;
        options?: Partial<ResolveExternalsPluginOptions>;
        packageJson?: PackageJson;
        tsconfig?: TsConfigResult;
    }) =>
        new MockPluginContext(
            resolveExternalsPlugin(
                {
                    name: "test",
                    ...packageJson,
                } as PackageJson,
                tsconfig,
                {
                    alias: {},
                    externals: [],
                    rollup: {},
                    rootDir: "/",
                    ...buildOptions,
                },
                logger,
                { ...defaultPluginConfig, ...options },
            ),
        );

    describe("buildins", () => {
        it("should mark Node builtins external by default", async () => {
            const context = getMockPluginContext({});

            for await (const builtin of ["path", "node:fs"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    external: true,
                });
            }
        });

        it("should NOT mark Node builtins external when builtins=false", async () => {
            const context = getMockPluginContext({ options: { builtins: false } });

            for await (const builtin of ["path", "node:fs"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    external: false,
                });
            }
        });

        it("should NOT mark Node builtins external when implicitely excluded", async () => {
            const context = getMockPluginContext({ options: { exclude: ["path", "node:fs"] } });

            for await (const builtin of ["path", "node:fs"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    external: false,
                });
            }
        });

        it("should mark Node builtins external when builtins=false and implicitly included", async () => {
            const context = getMockPluginContext({ buildOptions: { externals: ["path", "node:fs"] } as InternalBuildOptions, options: { builtins: false } });

            for await (const builtin of ["path", "node:fs"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    external: true,
                });
            }
        });

        it("should add 'node:' prefix to builtins by default", async () => {
            const context = getMockPluginContext({});

            for await (const builtin of ["node:path", "path"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: "node:path",
                });
            }
        });

        it("should remove 'node:' prefix when using builtinsPrefix='strip'", async () => {
            const context = getMockPluginContext({ options: { builtinsPrefix: "strip" } });

            for await (const builtin of ["node:path", "path"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: "path",
                });
            }
        });

        it("should NOT remove 'node:test' prefix even with builtinsPrefix='add'", async () => {
            const context = getMockPluginContext({ options: { builtinsPrefix: "strip" } });

            for await (const builtin of ["node:test"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: builtin,
                });
            }
        });

        it("should not recognize 'test' as a Node builtin", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("node", "index.js")).resolves.toBeNull();
        });

        it("should ignore 'node:' prefix when using builtinsPrefix='ignore'", async () => {
            const context = getMockPluginContext({ options: { builtinsPrefix: "ignore" } });

            for await (const builtin of ["node:path", "path"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: builtin,
                });
            }
        });
    });

    describe("specifier", () => {
        const specifiers = {
            absolutePosix: ["/root.js"],
            absoluteWin32: ["/root.js", "\\root.js", "C:\\root.js"],
            bare: ["foo", "bar"],
            relative: ["./sibling.js", "../parent.js"],
            subpath: ["lodash", "lodash/flatten"],
            virtual: ["\\0virtual"],
        };

        it("always ignores bundle entry point", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("./path/to/entry.js", undefined)).resolves.toBeNull();
        });

        it("always ignores virtual modules from other plugins", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("\\0virtual", undefined), `Failed without importer`).resolves.toBeNull();
            await expect(context.resolveId("\\0virtual", "file.js"), `Failed with importer`).resolves.toBeNull();
        });

        it("always ignores absolute specifiers", async () => {
            const context = getMockPluginContext({});

            for await (const specifier of specifiers[process.platform === "win32" ? "absoluteWin32" : "absolutePosix"]) {
                await expect(context.resolveId(specifier, undefined), `Failed on: ${specifier} without importer`).resolves.toBeNull();
                await expect(context.resolveId(specifier, "file.js"), `Failed on: ${specifier} with importer`).resolves.toBeNull();
            }
        });

        it("always ignores relative specifiers", async () => {
            const context = getMockPluginContext({ buildOptions: { externals: specifiers.relative } });

            for await (const specifier of specifiers.relative) {
                await expect(context.resolveId(specifier, undefined), `Failed on: ${specifier} without importer`).resolves.toBeNull();
                await expect(context.resolveId(specifier, "file.js"), `Failed on: ${specifier} with importer`).resolves.toBeNull();
            }
        });

        it("always ignores bare specifiers that are not dependencies", async () => {
            const context = getMockPluginContext({ options: { deps: true, devDeps: true, optDeps: true, peerDeps: true } });

            await expect(context.resolveId("not-a-dep", "index.js")).resolves.toBeNull();
        });

        it("marks dependencies external by default", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("test-dep", "index.js")).resolves.resolves.toBeFalsy();
        });

        it("does NOT mark dependencies external when deps=false", async () => {
            const context = getMockPluginContext({ options: { deps: false } });

            await expect(context.resolveId("test-dep", "index.js")).resolves.toBeNull();
        });

        it("does NOT mark excluded dependencies external", async () => {
            const context = getMockPluginContext({ options: { exclude: "test-dep" } });

            await expect(context.resolveId("test-dep", "index.js")).resolves.toBeNull();
        });

        it("marks peerDependencies external by default", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeNull();
        });

        it("does NOT mark peerDependencies external when peerDeps=false", async () => {
            const context = getMockPluginContext({ options: { peerDeps: false } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeNull();
        });

        it("does NOT mark excluded peerDependencies external", async () => {
            const context = getMockPluginContext({ options: { exclude: "test-peer-dep" } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeNull();
        });

        it("marks optionalDependencies external by default", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("test-opt-dep", "index.js")).resolves.toBeFalsy();
        });

        it("does NOT mark optionalDependencies external when optDeps=false", async () => {
            const context = getMockPluginContext({ options: { optDeps: false } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeNull();
        });

        it("does NOT mark excluded optionalDependencies external", async () => {
            const context = getMockPluginContext({ options: { exclude: "test-opt-dep" } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeNull();
        });

        it("does NOT mark devDependencies external by default", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeNull();
        });

        it("marks devDependencies external when devDeps=true", async () => {
            const context = getMockPluginContext({ options: { devDeps: true } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.resolves.toBeFalsy();
        });

        it("marks included devDependencies external", async () => {
            const context = getMockPluginContext({ buildOptions: { externals: "test-dev-dep" } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.resolves.toBeFalsy();
        });

        it("marks dependencies/peerDependencies/optionalDependencies subpath imports external", async () => {
            const context = getMockPluginContext({});

            await expect(context.resolveId("test-dep/sub", "index.js")).resolves.toBeFalsy();
            await expect(context.resolveId("test-peer-dep/sub", "index.js")).resolves.toBeFalsy();
            await expect(context.resolveId("test-opt-dep/sub", "index.js")).resolves.toBeFalsy();
        });

        it("marks subpath imports external (with regexes)", async () => {
            const context = getMockPluginContext({ buildOptions: { externals: [/^test-dev-dep/] } });

            await expect(context.resolveId("test-dev-dep", "index.js")).resolves.toBeFalsy();
            await expect(context.resolveId("test-dev-dep/sub", "index.js")).resolves.toBeFalsy();
        });
    });
});
