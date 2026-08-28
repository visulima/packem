import type { PackageJson } from "@visulima/package";
import type { ExternalsBuildOptions, ResolveExternalsPluginOptions } from "@visulima/packem-plugins/plugin/externals";
import { externalsPlugin } from "@visulima/packem-plugins/plugin/externals";
import type { BuildContext } from "@visulima/packem-share/types";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { InputOptions, NullValue } from "rollup";
import { describe, expect, it, vi } from "vitest";

import type { InternalBuildOptions } from "../../../../src/types";
import { MockPluginContext } from "../../../helpers";

// The plugin only calls debug/error/info/warn on its logger. We model just
// those here instead of importing @visulima/pail's `Pail` type, whose package
// re-exports from a non-existent `./pail.d.ts`, resolving to `any` and
// poisoning every consumer with no-unsafe-assignment.
type MockLogger = {
    debug: (...arguments_: unknown[]) => void;
    error: (...arguments_: unknown[]) => void;
    info: (...arguments_: unknown[]) => void;
    warn: (...arguments_: unknown[]) => void;
};

const mockedLogger: MockLogger = {
    debug: vi.fn<(...arguments_: unknown[]) => void>(),
    error: vi.fn<(...arguments_: unknown[]) => void>(),
    info: vi.fn<(...arguments_: unknown[]) => void>(),
    warn: vi.fn<(...arguments_: unknown[]) => void>(),
};

const defaultPluginConfig: ResolveExternalsPluginOptions = {
    builtins: true,
    builtinsPrefix: "add",
    deps: true,
    devDeps: false,
    exclude: [],
    optDeps: true,
    peerDeps: true,
};

type ExternalRollupInputOptions = InputOptions & {
    external: (source: string, importer: string | undefined, isResolved: boolean) => NullValue | boolean;
};

const TEST_DEV_DEP_REGEX = /^test-dev-dep/;

describe("externals-plugin", () => {
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
        tsconfig,
    }: {
        buildOptions?: Partial<InternalBuildOptions>;
        logger?: MockLogger;
        options?: Partial<ResolveExternalsPluginOptions>;
        packageJson?: PackageJson;
        tsconfig?: TsConfigResult;
    }) =>
        new MockPluginContext(
            externalsPlugin({
                externals: [],
                externalizedDevDependencies: new Set<string>(),
                hoistedDependencies: new Set(),
                implicitDependencies: new Set(),
                logger,
                options: {
                    ...buildOptions,
                    alias: {},
                    rollup: {
                        resolveExternals: {
                            ...defaultPluginConfig,
                            ...options,
                        },
                        ...buildOptions?.rollup,
                    },
                    rootDir: "/",
                },
                pkg: { name: "externals", ...packageJson } as PackageJson,
                tsconfig,
                usedDependencies: new Set(),
            } as unknown as BuildContext<ExternalsBuildOptions>),
        );

    describe("buildins", () => {
        it("should mark Node builtins external by default", () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(true);
            }
        });

        it("should NOT mark Node builtins external when builtins=false", () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                options: { builtins: false },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(false);
            }
        });

        it("should NOT mark Node builtins external when implicitely excluded", () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                options: { exclude: ["path", "node:fs"] },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(true);
            }
        });

        it("should mark Node builtins external when builtins=false and implicitly included", () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                buildOptions: {
                    externals: ["path", "node:fs"],
                },
                options: { builtins: false },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const builtin of ["path", "node:fs"]) {
                expect((rollupInputConfig as ExternalRollupInputOptions).external(builtin, "index.js", false)).toBe(false);
            }
        });

        it("should add 'node:' prefix to builtins by default", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            await Promise.all(
                ["node:path", "path"].map(async (builtin) =>
                    expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                        id: "node:path",
                    }),
                ),
            );
        });

        it("should remove 'node:' prefix when using builtinsPrefix='strip'", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                options: { builtinsPrefix: "strip" },
            });

            await Promise.all(
                ["node:path", "path"].map(async (builtin) =>
                    expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                        id: "path",
                    }),
                ),
            );
        });

        it("should NOT remove 'node:test' and 'node:sqlite' prefix even with builtinsPrefix='add'", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                options: { builtinsPrefix: "strip" },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            await Promise.all(
                ["node:test", "node:sqlite"].map(async (builtin) =>
                    expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                        id: builtin,
                    }),
                ),
            );
        });

        it("should ignore 'node:' prefix when using builtinsPrefix='ignore'", async () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                options: { builtinsPrefix: "ignore" },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            await Promise.all(
                ["node:path", "path"].map(async (builtin) =>
                    expect(context.resolveId(builtin, "index.js")).resolves.toMatchObject({
                        id: builtin,
                    }),
                ),
            );
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

        it("should always ignores virtual modules from other plugins", () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`\0virtual`, undefined, false), `Failed without importer`).toBe(false);
            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`\0virtual`, "file.js", false), `Failed with importer`).toBe(false);
        });

        it("should always ignores absolute specifiers", () => {
            expect.assertions(2);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const specifier of specifiers[process.platform === "win32" ? "absoluteWin32" : "absolutePosix"]) {
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(specifier, undefined, false),
                    `Failed on: ${specifier} without importer`,
                ).toBe(false);
                expect((rollupInputConfig as ExternalRollupInputOptions).external(specifier, "file.js", false), `Failed on: ${specifier} with importer`).toBe(
                    false,
                );
            }
        });

        it("should always ignores relative specifiers", () => {
            expect.assertions(4);

            const context = getMockPluginContext({
                buildOptions: { externals: specifiers.relative },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const specifier of specifiers.relative) {
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(specifier, undefined, false),
                    `Failed on: ${specifier} without importer`,
                ).toBe(false);
                expect((rollupInputConfig as ExternalRollupInputOptions).external(specifier, "file.js", false), `Failed on: ${specifier} with importer`).toBe(
                    false,
                );
            }
        });

        it("should always ignores bare specifiers that are not dependencies", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: {
                    deps: true,
                    devDeps: true,
                    optDeps: true,
                    peerDeps: true,
                },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("not-a-dep", "index.js", false)).toBe(false);
        });

        it("should mark package.json dependencies external by default", () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep", "index.js", false)).toBe(true);
        });

        it("should NOT mark package.json dependencies external when deps=false", () => {
            expect.assertions(1);

            const context = getMockPluginContext({ options: { deps: false } });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark excluded dependencies external", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: { exclude: ["test-dep"] },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep", "index.js", false)).toBe(false);
        });

        it("should mark peerDependencies external by default", () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-peer-dep", "index.js", false)).toBe(true);
        });

        it("should NOT mark peerDependencies external when peerDeps=false", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: { peerDeps: false },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark excluded peerDependencies external", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: { exclude: ["test-peer-dep"] },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should mark optionalDependencies external by default", () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-opt-dep", "index.js", false)).toBe(true);
        });

        it("should NOT mark optionalDependencies external when optDeps=false", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: { optDeps: false },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark excluded optionalDependencies external", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: { exclude: ["test-opt-dep"] },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should NOT mark devDependencies external by default", () => {
            expect.assertions(1);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(false);
        });

        it("should mark devDependencies external when devDeps=true", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                options: { devDeps: true },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(true);
        });

        it("should mark included devDependencies external", () => {
            expect.assertions(1);

            const context = getMockPluginContext({
                buildOptions: { externals: ["test-dev-dep"] },
            });

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dev-dep", "index.js", false)).toBe(true);
        });

        it("should mark dependencies/peerDependencies/optionalDependencies subpath imports external", () => {
            expect.assertions(3);

            const context = getMockPluginContext({});

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-dep/sub", "index.js", false)).toBe(true);
            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-peer-dep/sub", "index.js", false)).toBe(true);
            expect((rollupInputConfig as ExternalRollupInputOptions).external("test-opt-dep/sub", "index.js", false)).toBe(true);
        });

        it("should mark sub path imports external (with regexes)", () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                buildOptions: { externals: [TEST_DEV_DEP_REGEX] },
            });

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

    it("should mark absolute path as internal", () => {
        expect.assertions(1);

        const context = getMockPluginContext({});

        const rollupInputConfig: InputOptions = {};

        context.options(rollupInputConfig);

        expect((rollupInputConfig as ExternalRollupInputOptions).external("./index.js", undefined, false)).toBe(false);
    });

    it("should resolve alias to external id", () => {
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

    describe("windows paths", () => {
        // Previously, Rollup-passed Windows absolute paths like "D:\\a\\…\\src\\index.ts" were
        // split by getPackageName on "/" only, so the whole path ended up in hoistedDependencies
        // and failed the build with "These dependencies are shamefully hoisted: D:, D:\\…".
        const windowsAbsolutePaths = [
            String.raw`D:\a\visulima\visulima\packages\filesystem\path\src\index.ts`,
            String.raw`D:\a\visulima\visulima\packages\filesystem\path\src\utils.ts`,
            String.raw`D:`,
            String.raw`C:\Users\runner\work\proj\src\file.ts`,
            String.raw`\\server\share\src\file.ts`,
        ];

        it("should not treat windows absolute paths as hoisted dependencies", () => {
            // 5 windowsAbsolutePaths entries asserted in the loop + 1 final size assertion
            expect.assertions(6);

            const hoistedDependencies = new Set<string>();
            const usedDependencies = new Set<string>();
            const context = new MockPluginContext(
                externalsPlugin({
                    externals: [],
                    hoistedDependencies,
                    implicitDependencies: new Set(),
                    logger: mockedLogger,
                    options: {
                        alias: {},
                        rollup: { resolveExternals: defaultPluginConfig },
                        rootDir: "/",
                        sourceDir: "src",
                        validation: {
                            dependencies: {
                                hoisted: { exclude: [] },
                                unused: { exclude: [] },
                            },
                        },
                    } as unknown as InternalBuildOptions,
                    pkg: { dependencies: {}, name: "externals" },
                    tsconfig: undefined,
                    usedDependencies,
                } as unknown as BuildContext<ExternalsBuildOptions>),
            );

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const specifier of windowsAbsolutePaths) {
                expect(
                    (rollupInputConfig as ExternalRollupInputOptions).external(
                        specifier,
                        String.raw`D:\a\visulima\visulima\packages\filesystem\path\src\index.ts`,
                        false,
                    ),
                    `Failed on: ${specifier}`,
                ).toBe(false);
            }

            expect(hoistedDependencies.size, `Unexpected hoisted entries: ${[...hoistedDependencies].join(", ")}`).toBe(0);
        });

        it("should not record windows source paths as used dependencies", () => {
            expect.assertions(1);

            const usedDependencies = new Set<string>();
            const context = new MockPluginContext(
                externalsPlugin({
                    externals: [],
                    hoistedDependencies: new Set(),
                    implicitDependencies: new Set(),
                    logger: mockedLogger,
                    options: {
                        alias: {},
                        rollup: { resolveExternals: defaultPluginConfig },
                        rootDir: "/",
                        sourceDir: "src",
                    } as unknown as InternalBuildOptions,
                    pkg: { dependencies: { "test-dep": "*" }, name: "externals" },
                    tsconfig: undefined,
                    usedDependencies,
                } as unknown as BuildContext<ExternalsBuildOptions>),
            );

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            for (const specifier of windowsAbsolutePaths) {
                (rollupInputConfig as ExternalRollupInputOptions).external(specifier, undefined, false);
            }

            expect([...usedDependencies], `Leaked entries: ${[...usedDependencies].join(", ")}`).toStrictEqual([]);
        });

        it("should still detect real hoisted dependencies when importer uses windows separators", () => {
            expect.assertions(1);

            const hoistedDependencies = new Set<string>();
            const context = new MockPluginContext(
                externalsPlugin({
                    externals: [],
                    hoistedDependencies,
                    implicitDependencies: new Set(),
                    logger: mockedLogger,
                    options: {
                        alias: {},
                        rollup: { resolveExternals: defaultPluginConfig },
                        rootDir: "/",
                        sourceDir: "src",
                        validation: {
                            dependencies: {
                                hoisted: { exclude: [] },
                                unused: { exclude: [] },
                            },
                        },
                    } as unknown as InternalBuildOptions,
                    pkg: { dependencies: {}, name: "externals" },
                    tsconfig: undefined,
                    usedDependencies: new Set(),
                } as unknown as BuildContext<ExternalsBuildOptions>),
            );

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            (rollupInputConfig as ExternalRollupInputOptions).external(
                "binary-extensions",
                String.raw`D:\a\visulima\visulima\packages\filesystem\path\src\utils.ts`,
                false,
            );

            expect([...hoistedDependencies]).toStrictEqual(["binary-extensions"]);
        });

        it("should not flag a dep as hoisted when the importer lives under node_modules (windows separators)", () => {
            expect.assertions(1);

            const hoistedDependencies = new Set<string>();
            const context = new MockPluginContext(
                externalsPlugin({
                    externals: [],
                    hoistedDependencies,
                    implicitDependencies: new Set(),
                    logger: mockedLogger,
                    options: {
                        alias: {},
                        rollup: { resolveExternals: defaultPluginConfig },
                        rootDir: "/",
                        sourceDir: "src",
                        validation: {
                            dependencies: {
                                hoisted: { exclude: [] },
                                unused: { exclude: [] },
                            },
                        },
                    } as unknown as InternalBuildOptions,
                    pkg: { dependencies: {}, name: "externals" },
                    tsconfig: undefined,
                    usedDependencies: new Set(),
                } as unknown as BuildContext<ExternalsBuildOptions>),
            );

            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            (rollupInputConfig as ExternalRollupInputOptions).external("binary-extensions", String.raw`D:\a\proj\node_modules\some-pkg\index.js`, false);

            expect([...hoistedDependencies]).toStrictEqual([]);
        });

        it(String.raw`should treat windows relative specifiers (.\, ..\) as internal`, () => {
            expect.assertions(2);

            const context = getMockPluginContext({});
            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`.\sibling.ts`, undefined, false)).toBe(false);
            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`..\parent.ts`, undefined, false)).toBe(false);
        });

        it("should treat windows source-dir paths as internal", () => {
            expect.assertions(2);

            const context = getMockPluginContext({
                buildOptions: { sourceDir: "src" },
            });
            const rollupInputConfig: InputOptions = {};

            context.options(rollupInputConfig);

            expect((rollupInputConfig as ExternalRollupInputOptions).external(String.raw`src\utils.ts`, undefined, false)).toBe(false);
            expect((rollupInputConfig as ExternalRollupInputOptions).external("src/utils.ts", undefined, false)).toBe(false);
        });
    });
});
