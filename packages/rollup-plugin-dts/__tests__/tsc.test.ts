import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild as rolldownBuild } from "@sxzz/test-utils";
import { glob } from "@visulima/fs/glob";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index.js";
import findSourceMapChunk from "./utils.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe("tsc", () => {
    it("typescript compiler", async () => {
        expect.assertions(1);

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
        expect.assertions(1);

        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/multi-decls/index.ts"), [
            dts({
                compilerOptions: { isolatedDeclarations: false },
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("references", async () => {
        expect.assertions(1);

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
        expect.assertions(3);

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

        expect(sourcemap.sourceRoot).toBeOneOf([false, undefined]);
        expect(sourcemap.sources).toMatchInlineSnapshot(`
      [
        "../src/index.ts",
      ]
    `);
        expect(snapshot).toMatchSnapshot();
    });

    it("compiler project sourcemap (build: true)", async () => {
        expect.assertions(3);

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

        expect(sourcemap.sourceRoot).toBeOneOf([false, undefined]);
        expect(sourcemap.sources).toMatchInlineSnapshot(`
      [
        "../src/index.ts",
      ]
    `);
        expect(snapshot).toMatchSnapshot();
    });

    // Regression for sxzz/rolldown-plugin-dts#255: with `build: true`, the `.d.ts.map`
    // `sources` must point back to the original `.ts` (so "Go to Definition" lands on
    // source) rather than the intermediate generated `.d.ts`. The solution builder
    // re-parses the tsconfig, so `declarationMap` has to be re-applied to the emitting
    // program (see createProgramFactory in src/tsc/emit-build.ts).
    it("compiler project sourcemap maps to original .ts (build: true) (#255)", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/deep-source-map");
        const { chunks } = await rolldownBuild(
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

        expect(sourcemap.sources).toStrictEqual(["../src/index.ts"]);
    });

    it("composite projects sourcemap #80", async () => {
        expect.assertions(2);

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
        const { sources } = sourcemap;

        // Cross-project source must always appear; entry re-export file may be omitted by newer TypeScript
        expect(sources).toStrictEqual(expect.arrayContaining(["../../src/types.ts"]));
        expect(sourcemap.sourcesContent).toBeOneOf([undefined, []]);
    });

    it("composite references", async () => {
        expect.assertions(2);

        const root = path.resolve(dirname, "fixtures/composite-refs");

        // The outDir in tsconfig files.
        const temporaryDirectory = path.resolve(root, "temp");

        // Ensure .tsbuildinfo files do not exist before the test
        await fs.rm(temporaryDirectory, { force: true, recursive: true });

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
            cwd: temporaryDirectory,
        });

        expect(tsBuildInfoFiles).toHaveLength(0);
    });

    it("composite references incremental", async () => {
        expect.assertions(2);

        const root = path.resolve(dirname, "fixtures/composite-refs-incremental");

        // The outDir in tsconfig files.
        const temporaryDirectory = path.resolve(root, "temp");

        // Ensure .tsbuildinfo files do not exist before the test
        await fs.rm(temporaryDirectory, { force: true, recursive: true });

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
            cwd: temporaryDirectory,
        });

        expect(tsBuildInfoFiles.toSorted((a, b) => a.localeCompare(b))).toMatchInlineSnapshot(`
      [
        "dir1/tsconfig.1.tsbuildinfo",
        "dir2/tsconfig.2.tsbuildinfo",
      ]
    `);
    });

    it("vue-sfc w/ ts-compiler", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/vue-sfc");
        const { snapshot } = await rolldownBuild(path.resolve(root, "main.ts"), [
            dts({
                compilerOptions: {
                    isolatedDeclarations: false,
                },
                emitDtsOnly: true,
                vue: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    // `.vue` files used directly as entries, with no `.ts` file importing them. TypeScript
    // drops root files whose extension it does not natively support unless
    // `allowNonTsExtensions` is set, which made `program.getSourceFile()` return undefined
    // and the build throw "Source file not found". See sxzz/rolldown-plugin-dts#272.
    it("vue-sfc entries without a .ts importer", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/vue-sfc-entries");
        const { snapshot } = await rolldownBuild([path.resolve(root, "Foo.vue"), path.resolve(root, "Bar.vue")], [
            dts({
                compilerOptions: {
                    isolatedDeclarations: false,
                },
                emitDtsOnly: true,
                vue: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("vue-sfc w/ ts-compiler w/ vueCompilerOptions in tsconfig", async () => {
        expect.assertions(1);

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
        expect.assertions(1);

        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/jsdoc.ts"), [dts({ oxc: false })]);

        expect(snapshot).toMatchSnapshot();
    });

    it("jsdoc in js", async () => {
        expect.assertions(1);

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
        expect.assertions(1);

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
        expect.assertions(1);

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
        expect.assertions(1);

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

    it("import JSON", async () => {
        expect.assertions(1);

        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/import-json/index.ts"), [
            dts({
                compilerOptions: {
                    isolatedDeclarations: false,
                },
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    describe("resolve paths", () => {
        it.each(["oxc", "tsc"] as const)("resolver: %s", async (resolver) => {
            expect.assertions(1);

            const root = path.resolve(dirname, "fixtures/paths");
            const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [
                dts({
                    emitDtsOnly: true,
                    oxc: true,
                    resolver,
                    tsconfig: path.resolve(root, "tsconfig.json"),
                }),
            ]);

            expect(snapshot).toMatchSnapshot();
        });
    });

    // Regression for sxzz/rolldown-plugin-dts#258/#259: a get/set accessor inside a
    // type literal must not crash the tsc afterDeclarations transform.
    it("accessor in type literal does not crash (#258)", async () => {
        expect.assertions(3);

        const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/accessor-type-literal.ts"), [
            dts({
                compilerOptions: { isolatedDeclarations: false },
                emitDtsOnly: true,
                oxc: false,
            }),
        ]);

        // The get/set accessors must survive the stripPrivateFields transform with their
        // shape intact — not merely appear somewhere as bare substrings.
        expect(snapshot).toContain("get count(): number");
        expect(snapshot).toContain("set count(value: number)");
        expect(snapshot).toMatchSnapshot();
    });

    // Regression for sxzz/rolldown-plugin-dts#254: `declaration: false` combined with
    // `sourcemap` must not crash with a bare "Debug Failure"; declarations are forced on.
    it("declaration:false + sourcemap does not crash (#254)", async () => {
        expect.assertions(3);

        const { chunks, snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/basic.ts"), [
            dts({
                compilerOptions: { declaration: false, isolatedDeclarations: false },
                emitDtsOnly: true,
                oxc: false,
                sourcemap: true,
            }),
        ]);

        // The crash was in the sourcemap path (getSourceMappingURL), so assert the
        // declaration sourcemap was actually produced, not just that emit happened.
        const sourcemap = findSourceMapChunk(chunks, "basic.d.ts.map");

        expect(sourcemap.sources.length).toBeGreaterThan(0);
        expect(snapshot).toContain("declare");
        expect(snapshot).toMatchSnapshot();
    });

    it("rename infer", async () => {
        expect.assertions(1);

        const { snapshot } = await rolldownBuild(
            path.resolve(dirname, "fixtures/infer-renaming.ts"),
            [
                dts({
                    compilerOptions: {
                        isolatedDeclarations: false,
                    },
                    emitDtsOnly: true,
                }),
            ],
            { external: ["zod"] },
        );

        expect(snapshot).toMatchSnapshot();
    });
});
