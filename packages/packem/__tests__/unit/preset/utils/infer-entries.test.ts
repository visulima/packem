import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import inferEntries from "../../../../src/preset/utils/infer-entries";
import type { BuildContext, InferEntriesResult } from "../../../../src/types";

const createFiles = (files: string[], directory: string) => {
    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const file of files) {
        writeFileSync(`${directory}/${file}`, "", {
            overwrite: true,
            recursive: true,
        });
    }
};

describe("inferEntries", () => {
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
                    input: join(temporaryDirectoryPath, "src/test.ts"),
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
                ["src/", "src/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoint for `dist/test.js`"],
        } satisfies InferEntriesResult);
    });

    it("should support top-level '*' exports", () => {
        expect.assertions(2);

        createFiles(["src/index.ts"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { exports: { "./*": "./*" } },
                ["src/", "src/", "src/index.ts"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
        expect(defaultContext.logger.debug).toHaveBeenCalledTimes(1);
    });
    it("should handle multiple entries", () => {
        expect.assertions(1);

        createFiles(["src/index.ts", "src/first-test.ts", "src/test.mjs"], temporaryDirectoryPath);

        expect(
            inferEntries(
                {
                    exports: {
                        ".": "./dist/index.cjs",
                        "./test": "./dist/test.cjs",
                        "first-test": "./dist/first-test.cjs",
                    },
                },
                ["src/", "src/", "src/index.ts", "src/first-test.ts", "src/test.mjs"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/test.mjs"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/first-test.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("should recognise directory mappings", () => {
        expect.assertions(4);

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
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(
            inferEntries(
                { exports: { "./runtime/*": "./dist/runtime/*.mjs" }, type: "module" },
                ["src/", "src/runtime/", "src/runtime/test.js"].map((file) => join(temporaryDirectoryPath, file)),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    environment: "development",
                    esm: true,
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
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
                    input: join(temporaryDirectoryPath, "src/runtime/test.js"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        createFiles(["src/test/index.ts", "src/test/test2/index.ts", "src/test/index2.ts", "src/index.ts"], temporaryDirectoryPath);

        expect(
            inferEntries(
                { exports: { "./test/*": "./test/*.js" } },
                ["src/", "src/test/", "src/test/index.ts", "src/test/test2/", "src/test/test2/index.ts", "src/test/index2.ts", "src/index.ts"].map((file) =>
                    join(temporaryDirectoryPath, file),
                ),
                defaultContext,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/test/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/test/index2.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "development",
                    input: join(temporaryDirectoryPath, "src/test/test2/index.ts"),
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
                    input: join(temporaryDirectoryPath, "src/test.cts"),
                    runtime: "node",
                },

                {
                    declaration: true,
                    environment: "development",
                    esm: true,
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
                options: { ...defaultContext.options, declaration: true, outDir: "dist" },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );
        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    environment: "development",
                    esm: true,
                    fileAlias: "index.development",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
                {
                    cjs: true,
                    environment: "production",
                    esm: true,
                    input: join(temporaryDirectoryPath, "src/index.production.ts"),
                    runtime: "node",
                },
                {
                    environment: "development",
                    esm: true,
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
                options: { ...defaultContext.options, declaration: true, outDir: "dist" },
                pkg: defaultContext.pkg,
            } as unknown as BuildContext,
        );
        expect(result).toStrictEqual({
            entries: [
                {
                    environment: undefined,
                    esm: true,
                    fileAlias: "index.edge",
                    input: join(temporaryDirectoryPath, "src/index.ts"),
                    runtime: "node",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });
});
