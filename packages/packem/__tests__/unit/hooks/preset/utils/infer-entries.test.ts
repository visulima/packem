import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import type { BuildContext } from "@visulima/packem-share";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import inferEntries from "../../../../../src/config/preset/utils/infer-entries";
import type { InferEntriesResult } from "../../../../../src/types";

const createFiles = (files: string[], directory: string) => {
    for (const file of files) {
        writeFileSync(`${directory}/${file}`, "", {
            overwrite: true,
            recursive: true,
        });
    }
};

describe(inferEntries, () => {
    let temporaryDirectoryPath: string;
    let defaultContext: BuildContext;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        vi.stubEnv("NODE_ENV", "development");

        defaultContext = {
            environment: "development",
            logger: {
                debug: vi.fn(),
            },
            options: {
                declaration: false,
                outDir: "dist",
                rootDir: temporaryDirectoryPath,
                runtime: "node",
                sourceDir: "src",
            },
            pkg: {
                devDependencies: {
                    typescript: "*",
                },
            },
        } as unknown as BuildContext;
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });

        vi.unstubAllEnvs();
    });

    it("should throw a error if a ts file was found and no typescript was installed", async () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                { main: "dist/test.cjs" },
                ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
                { ...defaultContext, pkg: {} } as unknown as BuildContext,
            ),
        ).rejects.toThrowError("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json.");
    });

    it("should recognise main and module outputs", async () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            { main: "dist/test.cjs", module: "dist/test.mjs" },
            ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "/src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle nested indexes", async () => {
        expect.assertions(1);

        createFiles(["src/event/index.ts", "src/index.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            { module: "dist/index.mjs" },
            ["src/", "src/event/index.ts", "src/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "/src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle binary outputs", async () => {
        expect.assertions(3);

        createFiles(["src/cli.ts"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                { bin: "dist/cli.cjs" },
                ["src/", "src/cli.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: false,
                    environment: "development",
                    executable: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/cli.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                { bin: { nuxt: "dist/cli.js" } },
                ["src/", "src/cli.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: false,
                    environment: "development",
                    executable: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/cli.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                { bin: { nuxt: "dist/cli.js" }, type: "module" },
                ["src/", "src/cli.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    declaration: false,
                    environment: "development",
                    esm: true,
                    executable: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/cli.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should recognise `type: module` projects", async () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            { main: "dist/test.js", type: "module" },
            ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should match nested entrypoint paths", async () => {
        expect.assertions(1);

        createFiles(["src/other/runtime/index.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            { exports: "dist/other/runtime/index.js" },
            ["src/", "src/other", "src/other/runtime", "src/other/runtime/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/other/runtime/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle declarations from `types`", async () => {
        expect.assertions(3);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                { main: "dist/test.cjs", types: "custom/handwritten.d.ts" },
                ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
                {
                    options: { ...defaultContext.options, declaration: true },
                    pkg: defaultContext.pkg,
                } as unknown as BuildContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: undefined,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: ["Could not find entrypoint for `custom/handwritten.d.ts`"],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                {
                    main: "dist/test.cjs",
                    module: "dist/test.mjs",
                    types: "dist/test.d.ts",
                },
                ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
                {
                    environment: defaultContext.environment,
                    options: { ...defaultContext.options, declaration: true },
                    pkg: defaultContext.pkg,
                } as unknown as BuildContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                {
                    main: "dist/test.cjs",
                    module: "dist/test.mjs",
                    typings: "dist/test.d.ts",
                },
                ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
                {
                    environment: defaultContext.environment,
                    options: { ...defaultContext.options, declaration: true },
                    pkg: defaultContext.pkg,
                } as unknown as BuildContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle types within exports`", async () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    import: {
                        default: "dist/test.mjs",
                        types: "dist/test.d.mts",
                    },
                    require: {
                        default: "dist/test.cjs",
                        types: "dist/test.d.cts",
                    },
                },
            },
            ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                environment: defaultContext.environment,
                options: { ...defaultContext.options, declaration: true },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["import", "require"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle types only within exports`", async () => {
        expect.assertions(3);

        createFiles(["src/test.d.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    import: {
                        types: "dist/test.d.mts",
                    },
                    require: {
                        types: "dist/test.d.cts",
                    },
                },
            },
            ["src/", "src/test.d.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                environment: defaultContext.environment,
                options: { ...defaultContext.options, declaration: true },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    esm: true,
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    exportKey: new Set<string>(["import", "require"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.d.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        const result2 = await inferEntries(
            {
                exports: {
                    "./test": {
                        import: {
                            types: "dist/test.d.mts",
                        },
                        require: {
                            types: "dist/test.d.cts",
                        },
                    },
                },
            },
            ["src/", "src/test.d.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                environment: defaultContext.environment,
                options: { ...defaultContext.options, declaration: true },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result2).toStrictEqual({
            entries: [
                {
                    esm: true,
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    exportKey: new Set<string>(["test"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.d.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        const result3 = await inferEntries(
            {
                exports: {
                    "./test": {
                        types: "dist/test.d.ts",
                    },
                },
            },
            ["src/", "src/test.d.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                environment: defaultContext.environment,
                options: { ...defaultContext.options, declaration: true },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result3).toStrictEqual({
            entries: [
                {
                    declaration: true,
                    environment: "development",
                    exportKey: new Set<string>(["test"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.d.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should gracefully handles unknown entries", async () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                { exports: "dist/test.js" },
                ["src/", "src/gather.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.resolves.toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoint for `dist/test.js`"],
        } satisfies InferEntriesResult);
    });

    it("should support top-level '*' exports", async () => {
        expect.assertions(2);

        createFiles(["src/gather.ts"], temporaryDirectoryPath);

        const context = {
            ...defaultContext,
            logger: {
                debug: vi.fn(),
            },
        } as unknown as BuildContext;

        await expect(
            inferEntries(
                { exports: { "./*": "./*" } },
                ["src/", "src/", "src/gather.ts"].map((file) => join(temporaryDirectoryPath, file)),
                context,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
        expect(context.logger.debug).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple entries", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/first-test.ts", "src/test.mjs"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                {
                    exports: {
                        ".": "./dist/index.cjs",
                        "./first-test": "./dist/first-test.cjs",
                        "./test": "./dist/test.cjs",
                        "./test.css": "./dist/test.css",
                    },
                },
                ["src/", "src/index.ts", "src/first-test.ts", "src/test.mjs"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["first-test"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/first-test.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.mjs"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should recognise directory mappings", async () => {
        expect.assertions(5);

        createFiles(["src/runtime/test.js", "src/runtime/test2.js"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                { exports: "./dist/runtime/*" },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/runtime/test2.js"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                {
                    exports: { "./runtime/*": "./dist/runtime/*.mjs" },
                    type: "module",
                },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["runtime/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["runtime/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/runtime/test2.js"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                { exports: { "./runtime/*": { require: "./dist/runtime/*" } } },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["runtime/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["runtime/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/runtime/test2.js"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        createFiles(["src/test/gather.ts", "src/test/test2/gather.ts", "src/test/index2.ts", "src/gather.ts"], temporaryDirectoryPath);

        await expect(
            inferEntries(
                { exports: { "./test/*": "./test/*.js" } },
                ["src/", "src/test/", "src/test/gather.ts", "src/test/test2/", "src/test/test2/gather.ts", "src/test/index2.ts", "src/gather.ts"].map((file) =>
                    join(temporaryDirectoryPath, file),
                ),
                {
                    environment: "development",
                    options: {
                        outDir: join(temporaryDirectoryPath, "dist"),
                        outputExtensionMap: {},
                        runtime: "node",
                        sourceDir: join(temporaryDirectoryPath, "src"),
                    },
                },
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test/index2.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test/test2/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        await expect(
            inferEntries(
                {
                    exports: {
                        "./test/*": "./test/*.js",
                        "./test/*.css": "./test/*.css",
                    },
                },
                [
                    "src/",
                    "src/test/",
                    "src/test/gather.ts",
                    "src/test/test2/",
                    "src/test/test2/gather.ts",
                    "src/test/index2.ts",
                    "src/gather.ts",
                    "src/test/gather.css",
                ].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test/index2.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test/test2/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should return a warning if the directory mappings map to a empty directory", async () => {
        expect.assertions(1);

        await expect(
            inferEntries(
                { exports: { "./runtime/*": "./dist/runtime/*.mjs" } },
                ["src/", "src/runtime/"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).resolves.toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoints matching pattern `runtime/*` for output `./dist/runtime/*.mjs`"],
        } satisfies InferEntriesResult);
    });

    it("should map cjs and mjs to mts and cts, if they exists", async () => {
        expect.assertions(1);

        createFiles(["src/test.cts", "src/test.mts", "src/test.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    import: {
                        default: "dist/test.mjs",
                        types: "dist/test.d.mts",
                    },
                    require: {
                        default: "dist/test.cjs",
                        types: "dist/test.d.cts",
                    },
                },
            },
            ["src/", "src/test.ts", "src/test.cts", "src/test.mts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                environment: defaultContext.environment,
                options: { ...defaultContext.options, declaration: true },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    exportKey: new Set<string>(["import", "require"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.cts"),
                    runtime: "node",
                },
                {
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["import", "require"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/test.mts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should return sub-keys of exports", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);
        createFiles(["src/index.production.ts"], temporaryDirectoryPath);
        createFiles(["src/index.react-server.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    ".": {
                        default: "./dist/index.cjs",
                        import: {
                            default: "./dist/index.mjs",
                            development: "./dist/index.development.mjs",
                            production: "./dist/index.production.mjs",
                        },
                        "react-server": "./dist/index.react-server.mjs",
                        require: {
                            default: "./dist/index.cjs",
                            development: "./dist/index.development.cjs",
                            production: "./dist/index.production.cjs",
                        },
                    },
                },
            },
            ["src/", "src/index.ts", "src/index.react-server.ts", "src/index.production.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                environment: defaultContext.environment,
                options: {
                    ...defaultContext.options,
                    declaration: true,
                    outDir: "dist",
                },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: "index.development",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "production",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.production.ts"),
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.react-server.ts"),
                    runtime: "react-server",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should work with edge-light", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "edge-light": "./dist/index.edge.mjs",
                    import: "./dist/index.mjs",
                },
                type: "module",
            },
            ["src/", "src/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                options: {
                    ...defaultContext.options,
                    declaration: true,
                    outDir: "dist",
                },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: undefined,
                    esm: true,
                    exportKey: new Set<string>(["*"]),
                    fileAlias: "index.edge",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "edge-light",
                },
                {
                    environment: undefined,
                    esm: true,
                    exportKey: new Set<string>(["*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should match default, development and production exports", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    ".": {
                        default: "./dist/index.cjs",
                        import: {
                            default: "./dist/index.mjs",
                            development: "./dist/index.development.mjs",
                            production: "./dist/index.production.mjs",
                        },
                        require: {
                            default: "./dist/index.cjs",
                            development: "./dist/index.development.cjs",
                            production: "./dist/index.production.cjs",
                        },
                    },
                },
            },
            ["src/", "src/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                ...defaultContext,
                environment: undefined,
            },
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: undefined,
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: "index.development",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "production",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: "index.production",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should ignore specified export keys", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/images/icon.png"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    ".": "./dist/index.mjs",
                    "./assets": "./dist/assets/logo.svg",
                    "./images": "./dist/images/icon.png",
                },
                type: "module",
            },
            ["src/", "src/index.ts", "src/images/icon.png"].map((file) => join(temporaryDirectoryPath, file)),
            {
                ...defaultContext,
                options: {
                    ...defaultContext.options,
                    ignoreExportKeys: ["images", "assets"],
                },
            },
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should ignore nested export keys", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    ".": {
                        import: "./dist/index.mjs",
                        require: "./dist/index.cjs",
                    },
                    "./images": {
                        import: "./dist/images/index.mjs",
                        require: "./dist/images/index.cjs",
                    },
                },
            },
            ["src/", "src/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                ...defaultContext,
                options: {
                    ...defaultContext.options,
                    ignoreExportKeys: ["images"],
                },
            },
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should work with allowedExportExtensions", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/images/icon.svg"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    ".": "./dist/index.mjs",
                    "./images": "./dist/images/icon.svg",
                },
                type: "module",
            },
            ["src/", "src/index.ts", "src/images/icon.svg"].map((file) => join(temporaryDirectoryPath, file)),
            {
                ...defaultContext,
                options: {
                    ...defaultContext.options,
                    validation: {
                        packageJson: {
                            allowedExportExtensions: [".svg"],
                        },
                    },
                },
            },
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - multiple wildcards with same value", async () => {
        expect.assertions(1);

        createFiles(["src/foo/foo.ts", "src/bar/bar.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "./*": "./dist/*/*.mjs",
                },
            },
            ["src/foo/foo.ts", "src/bar/bar.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/bar/bar.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/foo/foo.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - capture multi-segment paths", async () => {
        expect.assertions(1);

        createFiles(["src/foo/index.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "./*": "./dist/*/*/index.js",
                },
            },
            ["src/", "src/foo/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoints matching pattern `*` for output `./dist/*/*/index.js`"],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - wildcard with suffix", async () => {
        expect.assertions(1);

        createFiles(["src/features/auth/handler.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "./features/*/handler": "./dist/features/*/handler.mjs",
                },
            },
            ["src/", "src/features/auth/handler.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["features/*/handler"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/features/auth/handler.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - with interleaved constants", async () => {
        expect.assertions(1);

        createFiles(["src/foo/_/foo/_/foo.ts", "src/bar/_/bar/_/bar.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "./*": "./dist/*/_/*/_/*.mjs",
                },
            },
            ["src/", "src/foo/_/foo/_/foo.ts", "src/bar/_/bar/_/bar.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/bar/_/bar/_/bar.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/foo/_/foo/_/foo.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - declaration file extensions", async () => {
        expect.assertions(1);

        createFiles(["src/types/models.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "./types/*": {
                        types: {
                            default: "./dist/types/*.d.ts",
                            import: "./dist/types/*.d.mts",
                            require: "./dist/types/*.d.cts",
                        },
                    },
                },
            },
            ["src/", "src/types/models.ts"].map((file) => join(temporaryDirectoryPath, file)),
            {
                ...defaultContext,
                options: {
                    ...defaultContext.options,
                    declaration: true,
                },
            } as unknown as BuildContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    declaration: true,
                    environment: "development",
                    exportKey: new Set<string>(["types/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/types/models.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - array of paths", async () => {
        expect.assertions(1);

        createFiles(["src/tools/logger.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    "./tools/*": ["./dist/tools/*.mjs", "./dist/tools/*.cjs"],
                },
            },
            ["src/", "src/tools/logger.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["tools/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/tools/logger.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle advanced wildcard patterns - mixed static and wildcard exports", async () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/utils/helper.ts", "src/constants.ts"], temporaryDirectoryPath);

        const result = await inferEntries(
            {
                exports: {
                    ".": "./dist/index.mjs",
                    "./constants": "./dist/constants.mjs",
                    "./utils/*": "./dist/utils/*.mjs",
                },
            },
            ["src/", "src/index.ts", "src/utils/helper.ts", "src/constants.ts"].map((file) => join(temporaryDirectoryPath, file)),
            defaultContext,
        );

        expect(result).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["constants"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/constants.ts"),
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["utils/*"]),
                    fileAlias: undefined,
                    input: join(temporaryDirectoryPath, "src/utils/helper.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });
});
