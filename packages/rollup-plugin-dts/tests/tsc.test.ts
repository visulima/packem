import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldownBuild } from "@sxzz/test-utils";
import { glob } from "tinyglobby";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index.ts";
import { findSourceMapChunk } from "./utils.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe("tsc", () => {
    it("typescript compiler", async () => {
        const root = path.resolve(dirname, "fixtures/tsc");
        const { snapshot } = await rolldownBuild(
            [path.resolve(root, "entry1.ts"), path.resolve(root, "entry2.ts")],
            [
                dts({
                    compilerOptions: {
                        isolatedDeclarations: false,
                        skipLibCheck: true,
                    },
                    emitDtsOnly: true,
                    oxc: false,
                }),
            ],
        );

        expect(snapshot.replaceAll(/\/\/#region.*/g, "")).toMatchSnapshot();
    });

    it("multi declarations", async () => {
        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/multi-decls/index.ts"), [
            dts({
                compilerOptions: { isolatedDeclarations: false },
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("references", async () => {
        const root = path.resolve(dirname, "fixtures/refs");

        const { snapshot } = await rolldownBuild(
            [path.resolve(root, "src/index.ts")],
            [
                dts({
                    build: true,
                    compilerOptions: { isolatedDeclarations: false },
                    tsconfig: path.resolve(root, "tsconfig.json"),
                }),
            ],
        );

        expect(snapshot).toMatchSnapshot();
    });

    it("compiler project sourcemap (build: false)", async () => {
        const root = path.resolve(dirname, "fixtures/deep-source-map");
        const { chunks, snapshot } = await rolldownBuild(
            [path.resolve(root, "src/index.ts")],
            [
                dts({
                    build: false,
                    sourcemap: true,
                    tsconfig: path.resolve(root, "tsconfig.json"),
                }),
            ],
            {},
            { dir: path.resolve(root, "dist") },
        );
        const sourcemap = findSourceMapChunk(chunks, "index.d.ts.map");

        expect(sourcemap.sourceRoot).toBe(false);
        expect(sourcemap.sources).toMatchInlineSnapshot(`
      [
        "../src/index.ts",
      ]
    `);
        expect(snapshot).toMatchSnapshot();
    });

    it("compiler project sourcemap (build: true)", async () => {
        const root = path.resolve(dirname, "fixtures/deep-source-map");
        const { chunks, snapshot } = await rolldownBuild(
            [path.resolve(root, "src/index.ts")],
            [
                dts({
                    build: true,
                    sourcemap: true,
                    tsconfig: path.resolve(root, "tsconfig.json"),
                }),
            ],
            {},
            { dir: path.resolve(root, "dist") },
        );
        const sourcemap = findSourceMapChunk(chunks, "index.d.ts.map");

        expect(sourcemap.sourceRoot).toBe(false);
        expect(sourcemap.sources).toMatchInlineSnapshot(`
      [
        "../src/index.d.ts",
      ]
    `);
        expect(snapshot).toMatchSnapshot();
    });

    it("composite projects sourcemap #80", async () => {
        const root = path.resolve(dirname, "fixtures/composite-refs-sourcemap");

        const { chunks } = await rolldownBuild(
            [path.resolve(root, "src/react/index.ts")],
            [
                dts({
                    build: true,
                    emitDtsOnly: true,
                    sourcemap: true,
                    tsconfig: path.resolve(root, "tsconfig.react.json"),
                }),
            ],
            {},
            { dir: path.resolve(root, "actual-output/react") },
        );

        const sourcemap = findSourceMapChunk(chunks, "index.d.ts.map");
        const sources = sourcemap.sources || [];
        const expectedSources = ["../../src/types.ts", "../../src/react/index.ts"];

        expect(sources.sort()).toEqual(expectedSources.sort());
        expect(sourcemap.sourcesContent).toBeOneOf([undefined, []]);
    });

    it("composite references", async () => {
        const root = path.resolve(dirname, "fixtures/composite-refs");

        // The outDir in tsconfig files.
        const tempDir = path.resolve(root, "temp");

        // Ensure .tsbuildinfo files do not exist before the test
        await fs.rm(tempDir, { force: true, recursive: true });

        const { snapshot } = await rolldownBuild(
            [path.resolve(root, "dir1/input1.ts"), path.resolve(root, "dir2/input2.ts")],
            [
                dts({
                    build: true,
                    compilerOptions: { isolatedDeclarations: false },
                    tsconfig: path.resolve(root, "tsconfig.json"),
                }),
            ],
        );

        expect(snapshot).toMatchSnapshot();

        // Ensure .tsbuildinfo files are not created after the test
        const tsBuildInfoFiles = await glob("**/*.tsbuildinfo", {
            absolute: false,
            cwd: tempDir,
        });

        expect(tsBuildInfoFiles).toHaveLength(0);
    });

    it("composite references incremental", async () => {
        const root = path.resolve(dirname, "fixtures/composite-refs-incremental");

        // The outDir in tsconfig files.
        const tempDir = path.resolve(root, "temp");

        // Ensure .tsbuildinfo files do not exist before the test
        await fs.rm(tempDir, { force: true, recursive: true });

        const { snapshot } = await rolldownBuild(
            [path.resolve(root, "dir1/input1.ts"), path.resolve(root, "dir2/input2.ts")],
            [
                dts({
                    build: true,
                    compilerOptions: { isolatedDeclarations: false },
                    tsconfig: path.resolve(root, "tsconfig.json"),
                }),
            ],
        );

        expect(snapshot).toMatchSnapshot();

        // Ensure .tsbuildinfo files are created after the test
        const tsBuildInfoFiles = await glob("**/*.tsbuildinfo", {
            absolute: false,
            cwd: tempDir,
        });

        expect(tsBuildInfoFiles.sort()).toMatchInlineSnapshot(`
      [
        "dir1/tsconfig.1.tsbuildinfo",
        "dir2/tsconfig.2.tsbuildinfo",
      ]
    `);
    });

    it("vue-sfc w/ ts-compiler", async () => {
        const root = path.resolve(dirname, "fixtures/vue-sfc");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.ts"), [
            dts({
                emitDtsOnly: true,
                vue: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("vue-sfc w/ ts-compiler w/ vueCompilerOptions in tsconfig", async () => {
        const root = path.resolve(dirname, "fixtures/vue-sfc-fallthrough");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.ts"), [
            dts({
                emitDtsOnly: true,
                tsconfig: path.resolve(root, "tsconfig.json"),
                vue: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("jsdoc", async () => {
        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/jsdoc.ts"), [dts({ oxc: false })]);

        expect(snapshot).toMatchSnapshot();
    });

    it.fails("jsdoc in js", async () => {
        const root = path.resolve(dirname, "fixtures/jsdoc-js");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.js"), [
            dts({
                emitDtsOnly: true,
                tsconfig: path.resolve(root, "tsconfig.json"),
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("ts-macro w/ ts-compiler", async () => {
        const root = path.resolve(dirname, "fixtures/ts-macro");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.ts"), [
            dts({
                emitDtsOnly: true,
                tsconfig: path.resolve(root, "tsconfig.json"),
                tsMacro: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("vue-sfc w/ ts-macro w/ ts-compiler", async () => {
        const root = path.resolve(dirname, "fixtures/vue-sfc-with-ts-macro");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.ts"), [
            dts({
                emitDtsOnly: true,
                tsconfig: path.resolve(root, "tsconfig.json"),
                tsMacro: true,
                vue: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("arktype", async () => {
        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/arktype.ts"), [
            dts({
                compilerOptions: {
                    isolatedDeclarations: false,
                },
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });
});
