import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import inferEntries from "../../../../../src/config/preset/utils/infer-entries";
import type { BuildContext, InferEntriesResult } from "../../../../../src/types";

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

    it("should throw a error if a ts file was found and no typescript was installed", () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        expect(() =>
            inferEntries(
                { main: "dist/test.cjs" },
                ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
                { ...defaultContext, pkg: {} } as unknown as BuildContext,
            ),
        ).toThrow("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json.");
    });

    it("should recognise main and module outputs", () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "/src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle nested indexes", () => {
        expect.assertions(1);

        createFiles(["src/event/index.ts", "src/index.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "/src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle binary outputs", () => {
        expect.assertions(3);

        createFiles(["src/cli.ts"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { bin: "dist/cli.cjs" },
                ["src/", "src/cli.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: false,
                    environment: "development",
                    executable: true,
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/cli.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
            inferEntries(
                { bin: { nuxt: "dist/cli.js" } },
                ["src/", "src/cli.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: false,
                    environment: "development",
                    executable: true,
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/cli.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
            inferEntries(
                { bin: { nuxt: "dist/cli.js" }, type: "module" },
                ["src/", "src/cli.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    declaration: false,
                    environment: "development",
                    esm: true,
                    executable: true,
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/cli.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should recognise `type: module` projects", () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should match nested entrypoint paths", () => {
        expect.assertions(1);

        createFiles(["src/other/runtime/index.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/other/runtime/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle declarations from `types`", () => {
        expect.assertions(3);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { main: "dist/test.cjs", types: "custom/handwritten.d.ts" },
                ["src/", "src/test.ts"].map((file) => join(temporaryDirectoryPath, file)),
                {
                    options: { ...defaultContext.options, declaration: true },
                    pkg: defaultContext.pkg,
                } as unknown as BuildContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: undefined,
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: ["Could not find entrypoint for `custom/handwritten.d.ts`"],
        } satisfies InferEntriesResult);

        expect(
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
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
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
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle types within exports`", () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should handle types only within exports`", () => {
        expect.assertions(3);

        createFiles(["src/test.d.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["import", "require"]),
                    input: join(temporaryDirectoryPath, "src/test.d.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        const result2 = inferEntries(
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
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["test"]),
                    input: join(temporaryDirectoryPath, "src/test.d.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        const result3 = inferEntries(
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
                    cjs: true,
                    declaration: true,
                    environment: "development",
                    exportKey: new Set<string>(["test"]),
                    input: join(temporaryDirectoryPath, "src/test.d.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should gracefully handles unknown entries", () => {
        expect.assertions(1);

        createFiles(["src/test.ts"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { exports: "dist/test.js" },
                ["src/", "src/gather.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoint for `dist/test.js`"],
        } satisfies InferEntriesResult);
    });

    it("should support top-level '*' exports", () => {
        expect.assertions(2);

        createFiles(["src/gather.ts"], temporaryDirectoryPath);

        const context = {
            ...defaultContext,
            logger: {
                debug: vi.fn(),
            },
        } as unknown as BuildContext;

        expect(
            inferEntries(
                { exports: { "./*": "./*" } },
                ["src/", "src/", "src/gather.ts"].map((file) => join(temporaryDirectoryPath, file)),
                context,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>("*"),
                    input: join(temporaryDirectoryPath, "src/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
        expect(context.logger.debug).toHaveBeenCalledTimes(1);
    });

    it("should handle multiple entries", () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/first-test.ts", "src/test.mjs"], temporaryDirectoryPath);

        expect(
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
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["."]),
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["first-test"]),
                    input: join(temporaryDirectoryPath, "src/first-test.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test"]),
                    input: join(temporaryDirectoryPath, "src/test.mjs"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should recognise directory mappings", () => {
        expect.assertions(5);

        createFiles(["src/runtime/test.js", "src/runtime/test2.js"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { exports: "./dist/runtime/*" },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(),
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
            inferEntries(
                {
                    exports: { "./runtime/*": "./dist/runtime/*.mjs" },
                    type: "module",
                },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["runtime/*"]),
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
            inferEntries(
                { exports: { "./runtime/*": { require: "./dist/runtime/*" } } },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["runtime/*"]),
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        createFiles(["src/test/gather.ts", "src/test/test2/gather.ts", "src/test/index2.ts", "src/gather.ts"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { exports: { "./test/*": "./test/*.js" } },
                ["src/", "src/test/", "src/test/gather.ts", "src/test/test2/", "src/test/test2/gather.ts", "src/test/index2.ts", "src/gather.ts"].map((file) =>
                    join(temporaryDirectoryPath, file),
                ),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    input: join(temporaryDirectoryPath, "src/test/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    input: join(temporaryDirectoryPath, "src/test/index2.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    input: join(temporaryDirectoryPath, "src/test/test2/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
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
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    input: join(temporaryDirectoryPath, "src/test/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    input: join(temporaryDirectoryPath, "src/test/index2.ts"),
                    isGlob: true,
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    exportKey: new Set<string>(["test/*"]),
                    input: join(temporaryDirectoryPath, "src/test/test2/gather.ts"),
                    isGlob: true,
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should return a warning if the directory mappings map to a empty directory", () => {
        expect.assertions(1);

        expect(
            inferEntries(
                { exports: { "./runtime/*": "./dist/runtime/*.mjs" } },
                ["src/", "src/runtime/"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoint for `./dist/runtime/*.mjs`"],
        } satisfies InferEntriesResult);
    });

    it("should map cjs and mjs to mts and cts, if they exists", () => {
        expect.assertions(1);

        createFiles(["src/test.cts", "src/test.mts", "src/test.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/test.cts"),
                    runtime: "node",
                },

                {
                    declaration: true,
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["import", "require"]),
                    input: join(temporaryDirectoryPath, "src/test.mts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should return sub-keys of exports", () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);
        createFiles(["src/index.production.ts"], temporaryDirectoryPath);
        createFiles(["src/index.react-server.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    fileAlias: "index.development",
                    input: join(temporaryDirectoryPath, "src/index.ts"),

                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "production",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    input: join(temporaryDirectoryPath, "src/index.production.ts"),

                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
                    exportKey: new Set<string>(["."]),
                    input: join(temporaryDirectoryPath, "src/index.react-server.ts"),

                    runtime: "react-server",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should work with edge-light", () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should match default, development and production exports", () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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

    it("should ignore specified export keys", () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/images/icon.png"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should ignore nested export keys", () => {
        expect.assertions(1);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should work with allowedExportExtensions", () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/images/icon.svg"], temporaryDirectoryPath);

        const result = inferEntries(
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
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });
});
