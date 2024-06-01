import { describe, expect, it } from "vitest";

import inferEntries from "../../../../src/preset/utils/infer-entries";
import type { InferEntriesResult } from "../../../../src/types";

describe("inferEntries", () => {
    it("recognises main and module outputs", () => {
        expect.assertions(1);

        const result = inferEntries({ main: "dist/test.cjs", module: "dist/test.mjs" }, ["src/", "src/test.ts"], false);

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    esm: true,
                    input: "src/test",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("handles nested indexes", () => {
        expect.assertions(1);

        const result = inferEntries({ module: "dist/index.mjs" }, ["src/", "src/event/index.ts", "src/index.ts"], false);

        expect(result).toStrictEqual({
            entries: [
                {
                    esm: true,
                    input: "src/index",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("handles binary outputs", () => {
        expect.assertions(3);

        expect(inferEntries({ bin: "dist/cli.cjs" }, ["src/", "src/cli.ts"], false)).toStrictEqual({
            entries: [
                {
                    cjs: true,

                    executable: true,
                    input: "src/cli",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(inferEntries({ bin: { nuxt: "dist/cli.js" } }, ["src/", "src/cli.ts"], false)).toStrictEqual({
            entries: [
                {
                    cjs: true,

                    executable: true,
                    input: "src/cli",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(inferEntries({ bin: { nuxt: "dist/cli.js" }, type: "module" }, ["src/", "src/cli.ts"], false)).toStrictEqual({
            entries: [
                {
                    esm: true,
                    executable: true,
                    input: "src/cli",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("recognises `type: module` projects", () => {
        expect.assertions(1);

        const result = inferEntries({ main: "dist/test.js", type: "module" }, ["src/", "src/test.ts"], false);

        expect(result).toStrictEqual({
            entries: [
                {
                    esm: true,
                    input: "src/test",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("matches nested entrypoint paths", () => {
        expect.assertions(1);

        const result = inferEntries({ exports: "dist/runtime/index.js" }, ["src/", "src/other/runtime/index.ts"], false);

        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    input: "src/other/runtime/index",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("handles declarations from `types`", () => {
        expect.assertions(3);

        expect(inferEntries({ main: "dist/test.cjs", types: "custom/handwritten.d.ts" }, ["src/", "src/test.ts"], true)).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    input: "src/test",
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
                ["src/", "src/test.ts"],
                true,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    esm: true,
                    input: "src/test",
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
                ["src/", "src/test.ts"],
                true,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    declaration: true,
                    esm: true,
                    input: "src/test",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("handles types within exports`", () => {
        expect.assertions(1);

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
            ["src/", "src/test.ts"],
            true,
        );
        expect(result).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    dts: true,
                    input: "src/test",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("gracefully handles unknown entries", () => {
        expect.assertions(1);

        expect(inferEntries({ exports: "dist/test.js" }, ["src/", "src/index.ts"], false)).toStrictEqual({
            entries: [],
            warnings: ["Could not find entrypoint for `dist/test.js`"],
        } satisfies InferEntriesResult);
    });

    it("ignores top-level exports", () => {
        expect.assertions(1);

        expect(inferEntries({ exports: { "./*": "./*" } }, ["src/", "src/", "src/index.ts"], false)).toStrictEqual({
            entries: [],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("handles multiple entries", () => {
        expect.assertions(1);

        expect(
            inferEntries(
                {
                    exports: {
                        ".": "./dist/index.cjs",
                        "./test": "./dist/test.cjs",
                        "first-test": "./dist/first-test.cjs",
                    },
                },
                ["src/", "src/", "src/index.ts", "src/first-test.ts", "src/test.mjs"],
                false,
            ),
        ).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    input: "src/index",
                },
                {
                    cjs: true,
                    input: "src/test",
                },
                {
                    cjs: true,
                    input: "src/first-test",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });

    it("recognises directory mappings", () => {
        expect.assertions(4);

        expect(inferEntries({ exports: "./dist/runtime/*" }, ["src/", "src/runtime/", "src/runtime/test.js"], false)).toStrictEqual({
            entries: [
                {
                    esm: true,
                    input: "src/runtime/",
                    outDir: "./dist/runtime/",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(inferEntries({ exports: { "./runtime/*": "./dist/runtime/*.mjs," } }, ["src/", "src/runtime/"], false)).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    input: "src/runtime/",
                    outDir: "./dist/runtime/",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(inferEntries({ exports: { "./runtime/*": "./dist/runtime/*.mjs," }, type: "module" }, ["src/", "src/runtime/"], false)).toStrictEqual({
            entries: [
                {
                    esm: true,
                    input: "src/runtime/",
                    outDir: "./dist/runtime/",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);

        expect(inferEntries({ exports: { "./runtime/*": { require: "./dist/runtime/*" } } }, ["src/", "src/runtime/"], false)).toStrictEqual({
            entries: [
                {
                    cjs: true,
                    input: "src/runtime/",
                    outDir: "./dist/runtime/",
                },
            ],
            warnings: [],
        } satisfies InferEntriesResult);
    });
});
