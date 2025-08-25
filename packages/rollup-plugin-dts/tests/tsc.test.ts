import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldownBuild } from "@sxzz/test-utils";
import { glob } from "tinyglobby";
import { describe, expect } from "vitest";

import { dts } from "../src/index.js";

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
                    isolatedDeclarations: false,
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

    it("jsdoc", async () => {
        const { snapshot } = await rolldownBuild(
            path.resolve(dirname, "fixtures/jsdoc.ts"),
            [dts({ isolatedDeclarations: false })],
        );

        expect(snapshot).toMatchSnapshot();
    });
});
