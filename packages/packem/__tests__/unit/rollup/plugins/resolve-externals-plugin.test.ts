import type { PackageJson } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { InputOptions, NullValue } from "rollup";
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

type ExternalRollupInputOptions = InputOptions & { external: (source: string, importer: string | undefined, isResolved: boolean) => NullValue | boolean };

describe("resolve-externals-plugin", () => {
    const getMockPluginContext = ({
        buildOptions,
        logger = mockedLogger,
        options,
        packageJson = {
            dependencies: {
                "test-dep": "*",
            },
            devDependencies: {
                "test-dev-dep": "*",
            },
            optionalDependencies: {
                "test-opt-dep": "*",
            },
            peerDependencies: {
                "test-peer-dep": "*",
            },
        },
        tsconfig = undefined,
    }: {
        buildOptions?: Partial<InternalBuildOptions>;
        logger?: Pail;
        options?: Partial<ResolveExternalsPluginOptions>;
        packageJson?: PackageJson;
        tsconfig?: TsConfigResult;
    }) =>
        new MockPluginContext(
            resolveExternalsPlugin({
                externals: [],
                hoistedDependencies: new Set(),
                implicitDependencies: new Set(),
                logger,
                options: {
                    ...buildOptions,
                    alias: {},
                    rollup: {
                        resolveExternals: { ...defaultPluginConfig, ...options },
                        ...buildOptions?.rollup,
                    },
                    rootDir: "/",
                },
                pkg: { name: "externals", ...packageJson } as PackageJson,
                tsconfig,
                usedDependencies: new Set(),
            }),
        );

    describe("buildins", () => {
        it("should mark Node builtins external by default", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(true);
            }
        });

        it("should NOT mark Node builtins external when builtins=false", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ options: { builtins: false } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(false);
            }
        });

        it("should NOT mark Node builtins external when implicitely excluded", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ options: { exclude: ["path", "node:fs"] } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(true);
            }
        });

        it("should mark Node builtins external when builtins=false and implicitly included", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ buildOptions: { externals: ["path", "node:fs"] } as InternalBuildOptions, options: { builtins: false } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(false);
            }
        });

        it("should add 'node:' prefix to builtins by default", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            for await (const builtin of ["node:path", "path"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: "node:path",
                });
            }
        });

        it("should remove 'node:' prefix when using builtinsPrefix='strip'", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ options: { builtinsPrefix: "strip" } });

            for await (const builtin of ["node:path", "path"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: "path",
                });
            }
        });

        it("should NOT remove 'node:test' and 'node:sqlite' prefix even with builtinsPrefix='add'", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ options: { builtinsPrefix: "strip" } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for await (const builtin of ["node:test", "node:sqlite"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: builtin,
                });
            }
        });

        it("should ignore 'node:' prefix when using builtinsPrefix='ignore'", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ options: { builtinsPrefix: "ignore" } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["node:path", "path"]) {
                await expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                    id: builtin,
                });
            }
        });

        it("should not recognize 'test' as a Node builtin", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            await expect(context.resolveId("node", "index.js")).resolves.toBeUndefined();
            expect((rollupInputConfig as ExternalRollupInputOptions).external("node", "index.js", false)).toBe(false);
        });

        it("should resolve prefixed builtins", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            await expect(context.resolveId("node:test", "index.js")).resolves.toMatchObject({
                id: "node:test",
            });
            await expect(context.resolveId("node:sqlite", "index.js")).resolves.toMatchObject({
                id: "node:sqlite",
            });
        });
    });

    describe("specifier", () => {
        const specifiers = {
            absolutePosix: ["/root.js"],
            absoluteWin32: ["/root.js", String.raw`\root.js`, String.raw`C:\root.js`],
            bare: ["foo", "bar"],
            relative: ["./sibling.js", "../parent.js"],
            subpath: ["lodash", "lodash/flatten"],
            virtual: [String.raw`\0virtual`],
        };

        it("should always ignores bundle entry point", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            await expect(context.resolveId("./path/to/entry.js", undefined)).resolves.toBeUndefined();
        });

        it("should always ignores virtual modules from other plugins", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`\0virtual`, undefined, false), `Failed without importer`).toBe(false);
            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`\0virtual`, "file.js", false), `Failed with importer`).toBe(false);
        });

        it("should always ignores absolute specifiers", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const specifier of specifiers[process.platform === "win32" ? "absoluteWin32" : "absolutePosix"]) {
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(specifier, undefined, false),
                    `Failed on: ${specifier} without importer`,
                ).toBe(false);
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(specifier, "file.js", false),
                    `Failed on: ${specifier} with importer`,
                ).toBe(false);
            }
        });

        it("should always ignores relative specifiers", async () => {
            expect.assertions(4);

            const context = getMockPluginContext({ buildOptions: { externals: specifiers.relative } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const specifier of specifiers.relative) {
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(specifier, undefined, false),
                    `Failed on: ${specifier} without importer`,
                ).toBe(false);
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(specifier, "file.js", false),
                    `Failed on: ${specifier} with importer`,
                ).toBe(false);
            }
        });

        it("should always ignores bare specifiers that are not dependencies", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { deps: true, devDeps: true, optDeps: true, peerDeps: true } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("not-a-dep", "index.js", false)).toBe(false);
        });

        it("should mark package.json dependencies external by default", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep", "index.js", false)).toBe(true);
        });

        it("should NOT mark package.json dependencies external when deps=false", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { deps: false } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark excluded dependencies external", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { exclude: ["test-dep"] } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep", "index.js", false)).toBe(false);
        });

        it("should mark peerDependencies external by default", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-peer-dep", "index.js", false)).toBe(true);
        });

        it("should NOT mark peerDependencies external when peerDeps=false", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { peerDeps: false } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark excluded peerDependencies external", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { exclude: ["test-peer-dep"] } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should mark optionalDependencies external by default", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-opt-dep", "index.js", false)).toBe(true);
        });

        it("should NOT mark optionalDependencies external when optDeps=false", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { optDeps: false } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark excluded optionalDependencies external", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { exclude: ["test-opt-dep"] } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark devDependencies external by default", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should mark devDependencies external when devDeps=true", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { devDeps: true } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(true);
        });

        it("should mark included devDependencies external", async () => {
            expect.assertions(1);

            const context = getMockPluginContext({ buildOptions: { externals: ["test-dev-dep"] } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(true);
        });

        it("should mark dependencies/peerDependencies/optionalDependencies subpath imports external", async () => {
            expect.assertions(3);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep/sub", "index.js", false)).toBe(true);
            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-peer-dep/sub", "index.js", false)).toBe(true);
            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-opt-dep/sub", "index.js", false)).toBe(true);
        });

        it("should mark sub path imports external (with regexes)", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({ buildOptions: { externals: [/^test-dev-dep/] } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(true);
            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep/sub", "index.js", false)).toBe(true);
        });

        it("should mark sub path of a package.json dependencies as external", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                packageJson: {
                    dependencies: {
                        react: "^18.2.0",
                        "react-dom": "^18.2.0",
                    },
                    devDependencies: {
                        "@types/react": "^18.0.0",
                        "@types/react-dom": "^18.0.0",
                    },
                },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("react/jsx-runtime", "index.jsx", false)).toBe(true);
        });
    });

    it("should mark absolute path as internal", async () => {
        expect.assertions(1);

        const context = getMockPluginContext({});

        const rollupInputConfig: InputOptions = {};

        context.options(rollupInputConfig);

        expect((rollupInputConfig as ExternalRollupInputOptions).external("./index.js", undefined, false)).toBe(false);
    });

    it("should resolve alias to external id", async () => {
        expect.assertions(1);

        const context = getMockPluginContext({
            buildOptions: {
                alias: {
                    "alias-test": "@test/foo",
                },
                externals: ["alias-test"],
            },
        });

        const rollupInputConfig: InputOptions = {};

        context.options(rollupInputConfig);

        expect((rollupInputConfig as ExternalRollupInputOptions).external("alias-test", undefined, false)).toBe(true);
    });
});
