import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldownBuild } from "@sxzz/test-utils";
import { glob } from "tinyglobby";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index";

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
        const { snapshot } = await rolldownBuild(
            path.resolve(dirname, "fixtures/multi-decls/index.ts"),
            [
                dts({
                    compilerOptions: { isolatedDeclarations: false },
                    emitDtsOnly: true,
                }),
            ],
        );

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

    it("should generate correct sourcemaps for a complex composite project with conflicting tsconfig options", async () => {
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

        const sourcemapChunk = chunks.find((chunk) =>
            chunk.fileName.endsWith(".d.ts.map"),
        );

        expect(sourcemapChunk).toBeDefined();
        expect(sourcemapChunk?.type).toBe("asset");

        const sourcemap = JSON.parse((sourcemapChunk as any).source as string);
        const sources: string[] = sourcemap.sources.map((s: string) =>
            s.replaceAll("\\\\", "/"),
        );
        const expectedSources = ["../../src/types.ts", "../../src/react/index.ts"];

        expect(sources.sort()).toEqual(expectedSources.sort());
        expect(
            sourcemap.sourcesContent === undefined
            || (Array.isArray(sourcemap.sourcesContent)
                && sourcemap.sourcesContent.length === 0),
        ).toBe(true);
    });

    it("composite references", async () => {
        const root = path.resolve(dirname, "fixtures/composite-refs");

        // The outDir in tsconfig files.
        const tempDir = path.resolve(root, "temp");

        // Ensure .tsbuildinfo files do not exist before the test
        await fs.rm(tempDir, { force: true, recursive: true });

        const { snapshot } = await rolldownBuild(
            [
                path.resolve(root, "dir1/input1.ts"),
                path.resolve(root, "dir2/input2.ts"),
            ],
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
            [
                path.resolve(root, "dir1/input1.ts"),
                path.resolve(root, "dir2/input2.ts"),
            ],
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
        const { snapshot } = await rolldownBuild(
            path.resolve(dirname, "fixtures/jsdoc.ts"),
            [dts({ oxc: false })],
        );

        expect(snapshot).toMatchSnapshot();
    });

    it("jsdoc in js", async () => {
        const root = path.resolve(dirname, "fixtures/jsdoc-js");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.js"), [
            dts({
                emitDtsOnly: true,
                tsconfig: path.resolve(root, "tsconfig.json"),
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });
});
