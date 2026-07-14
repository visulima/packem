import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild } from "@sxzz/test-utils";
import { describe, expect, it, vi } from "vitest";

import { dts, resolveOptions } from "../src/index.js";
import { getTsgoPathFromNodeModules } from "../src/tsgo.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const EXPORT_BLOCK_RE = /export\s*\{[^}]*\}/g;
const MISSING_FILE_RE = /Could not resolve ['"]\.\/missing-file['"]/u;
// External (unresolvable) `import("pkg").Type` references are preserved inline
// rather than hoisted into a namespace import.
const STUB_LIB_IMPORT_RE = /import\(['"]stub_lib['"]\)\.LibType/u;
// Type-only exports may be emitted either inline (`export { type X }`) or
// normalized (`export type { X }`); both are accepted.
const TYPE_TASK_WRAPPER_RE = /export\s+type\s*\{[^}]*\bTaskWrapper\b|export\s*\{[^}]*\btype\s+TaskWrapper\b/u;
const TYPE_TASK_RE = /export\s+type\s*\{[^}]*\bTask\b|export\s*\{[^}]*\btype\s+Task\b/u;
const TYPE_FOO_RE = /export\s+type\s*\{[^}]*\bFoo\b|export\s*\{[^}]*\btype\s+Foo\b/u;
const EXPORT_BRACE_RE = /export\s*\{/u;
const TRIPLE_SLASH_NODE_RE = /\/\/\/ <reference types="node" \/>/g;

describe("dts plugin", () => {
    it("basic", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/basic.ts"), [dts()]);

        expect(snapshot).toMatchSnapshot();
    });

    it("tsx", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/tsx.tsx"), [dts()]);

        expect(snapshot).toMatchSnapshot();
    });

    it("resolve dependencies", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/resolve-dep.ts"), [
            dts({
                emitDtsOnly: true,
                oxc: true,
                resolve: ["@visulima/tsconfig"],
            }),
        ]);

        expect(snapshot).contain("type TsConfigResult");
        expect(snapshot).not.contain("node_modules/rollup");
    });

    it("resolve dts", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/resolve-dts/index.ts"), [dts()]);

        expect(snapshot).matchSnapshot();
    });

    // Regression for sxzz/rolldown-plugin-dts#227: when a consumer imports from a
    // dependency that re-exports a type, the emitted declaration must reference the
    // dependency the consumer actually depends on — not the type's origin package.
    describe("re-export specifier resolution (#227)", () => {
        const root = path.resolve(dirname, "fixtures/reexport-specifier");

        it("keeps the written specifier for a directly imported type", async () => {
            expect.assertions(2);

            const { snapshot } = await rollupBuild(path.resolve(root, "src/index.ts"), [
                dts({ emitDtsOnly: true, oxc: true, tsconfig: path.resolve(root, "tsconfig.json") }),
            ]);

            expect(snapshot).toContain("from 'design-system'");
            expect(snapshot).not.toContain("inner-lib");
        });

        it("rewrites an inferred origin specifier to the re-exporting dependency", async () => {
            expect.assertions(2);

            // No explicit annotation: TS infers the type and synthesizes
            // `import("inner-lib").InnerType` (the origin). The fix rewrites it to the
            // `design-system` dependency the source imports.
            const { snapshot } = await rollupBuild(path.resolve(root, "src/infer.ts"), [
                dts({ emitDtsOnly: true, oxc: false, tsconfig: path.resolve(root, "tsconfig.infer.json") }),
            ]);

            expect(snapshot).toContain("import(\"design-system\").InnerType");
            expect(snapshot).not.toContain("inner-lib");
        });
    });

    // Test alias mapping based on rollup input option
    it("input alias", async () => {
        expect.assertions(5);

        const root = path.resolve(dirname, "fixtures/alias");
        const { chunks, snapshot } = await rollupBuild(
            {
                output1: path.resolve(root, "input1.ts"),
                "output2/index": path.resolve(root, "input2.ts"),
            },
            [dts({ emitDtsOnly: false })],
        );
        const fileNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

        // The JS output and DTS output should have the same structure
        expect(fileNames).toContain("output1.d.ts");
        expect(fileNames).toContain("output1.js");
        expect(fileNames).toContain("output2/index.d.ts");
        expect(fileNames).toContain("output2/index.js");

        expect(snapshot).toMatchSnapshot();
    });

    // Regression for sxzz/rolldown-plugin-dts#208: a fixed-string `entryFileNames`
    // (no `[name]` placeholder) must still carry the full `.d.<x>ts` extension.
    it("fixed-string entryFileNames keeps the .d extension (#208)", async () => {
        expect.assertions(1);

        const { chunks } = await rollupBuild(
            path.resolve(dirname, "fixtures/basic.ts"),
            [dts({ emitDtsOnly: true })],
            {},
            { entryFileNames: "index.mjs" },
        );
        const fileNames = chunks.map((chunk) => chunk.fileName);

        expect(fileNames.some((name) => name.endsWith(".d.mts"))).toBe(true);
    });

    it("isolated declaration error", async () => {
        expect.assertions(2);

        const caughtError = await rollupBuild(path.resolve(dirname, "fixtures/isolated-decl-error.ts"), [
            dts({
                emitDtsOnly: true,
                oxc: true,
            }),
        ]).catch((error: unknown) => error);

        expect(String(caughtError)).toContain(`Function must have an explicit return type annotation with --isolatedDeclarations.`);
        expect(String(caughtError)).toContain(`export function fn() {`);
    });

    it("paths", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/paths");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [
            dts({
                emitDtsOnly: true,
                oxc: true,
                tsconfig: path.resolve(root, "tsconfig.json"),
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("tree-shaking", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(
            path.resolve(dirname, "fixtures/tree-shaking/index.ts"),
            [
                dts(),
                {
                    name: "external-node",
                    resolveId(id) {
                        if (id.startsWith("node:"))
                            return { external: true, id, moduleSideEffects: false };

                        return undefined;
                    },
                },
            ],
            { treeshake: true },
        );

        expect(snapshot).matchSnapshot();
    });

    describe("dts input", () => {
        it("input array", async () => {
            expect.assertions(2);

            const { chunks, snapshot } = await rollupBuild([path.resolve(dirname, "fixtures/dts-input.d.ts")], [dts({ dtsInput: true })], {});

            expect(chunks[0].fileName).toBe("dts-input.d.ts");
            expect(snapshot).toMatchSnapshot();
        });

        it("input object", async () => {
            expect.assertions(2);

            const { chunks, snapshot } = await rollupBuild({ index: path.resolve(dirname, "fixtures/dts-input.d.ts") }, [dts({ dtsInput: true })]);

            expect(chunks[0].fileName).toBe("index.d.ts");
            expect(snapshot).toMatchSnapshot();
        });

        it(".d in chunk name", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild({ "index.d": path.resolve(dirname, "fixtures/dts-input.d.ts") }, [dts({ dtsInput: true })]);

            expect(chunks[0].fileName).toBe("index.d.ts");
        });

        it("full extension in chunk name", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild({ "index.d.mts": path.resolve(dirname, "fixtures/dts-input.d.ts") }, [dts({ dtsInput: true })]);

            expect(chunks[0].fileName).toBe("index.d.mts");
        });

        it("custom entryFileNames with .d", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                { index: path.resolve(dirname, "fixtures/dts-input.d.ts") },
                [dts({ dtsInput: true })],
                {},
                {
                    entryFileNames: "[name].d.cts",
                },
            );

            expect(chunks[0].fileName).toBe("index.d.cts");
        });

        it("custom entryFileNames without .d", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                [path.resolve(dirname, "fixtures/dts-input.d.ts")],
                [dts({ dtsInput: true })],
                {},
                {
                    entryFileNames: "[name].mts",
                },
            );

            expect(chunks[0].fileName).toBe("dts-input.d.mts");
        });

        it("custom entryFileNames function", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                { index: path.resolve(dirname, "fixtures/dts-input.d.ts") },
                [dts({ dtsInput: true })],
                {},
                {
                    entryFileNames: () => "[name].mts",
                },
            );

            expect(chunks[0].fileName).toBe("index.d.mts");
        });

        it("invalid entryFileNames gets overridden with stripped .d", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                { "index.d": path.resolve(dirname, "fixtures/dts-input.d.ts") },
                [dts({ dtsInput: true })],
                {},
                {
                    entryFileNames: "[name].invalid",
                },
            );

            expect(chunks[0].fileName).toBe("index.d.ts");
        });

        it("invalid entryFileNames gets overridden and preserves subextension", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                { "index.asdf": path.resolve(dirname, "fixtures/dts-input.d.ts") },
                [dts({ dtsInput: true })],
                {},
                {
                    entryFileNames: "[name].invalid",
                },
            );

            expect(chunks[0].fileName).toBe("index.asdf.d.ts");
        });

        it("default chunk name", async () => {
            expect.assertions(4);

            const { chunks, snapshot } = await rollupBuild(
                [path.resolve(dirname, "fixtures/dts-multi-input/input1.d.ts"), path.resolve(dirname, "fixtures/dts-multi-input/input2.d.ts")],
                [dts({ dtsInput: true })],
                {},
                {
                    entryFileNames: "[name].mts",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toContain("input1.d.mts");
            expect(chunkNames).toContain("input2.d.mts");
            expect(chunkNames.some((n) => n.endsWith(".d.ts") && !n.startsWith("input"))).toBe(true);

            expect(snapshot).toMatchSnapshot();
        });

        it("custom chunk name", async () => {
            expect.assertions(4);

            const { chunks, snapshot } = await rollupBuild(
                [path.resolve(dirname, "fixtures/dts-multi-input/input1.d.ts"), path.resolve(dirname, "fixtures/dts-multi-input/input2.d.ts")],
                [dts({ dtsInput: true })],
                {},
                {
                    chunkFileNames: "chunks/[hash]-[name].ts",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toContain("input1.d.ts");
            expect(chunkNames).toContain("input2.d.ts");
            expect(chunkNames.some((n) => n.startsWith("chunks/") && n.endsWith(".d.ts"))).toBe(true);

            expect(snapshot).toMatchSnapshot();
        });
    });

    describe("entryFileNames", () => {
        it(".mjs -> .d.mts", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                [path.resolve(dirname, "fixtures/basic.ts")],
                [dts()],
                {},
                {
                    entryFileNames: "[name].mjs",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toStrictEqual(["basic.d.mts", "basic.mjs"]);
        });

        it(".cjs -> .d.cts", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                [path.resolve(dirname, "fixtures/basic.ts")],
                [dts()],
                {},
                {
                    entryFileNames: "[name].cjs",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toStrictEqual(["basic.cjs", "basic.d.cts"]);
        });

        it(".mjs -> .d.mts with custom chunk name", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                { custom: path.resolve(dirname, "fixtures/basic.ts") },
                [dts()],
                {},
                {
                    entryFileNames: "[name].mjs",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toStrictEqual(["custom.d.mts", "custom.mjs"]);
        });

        it("preserves invalid extension", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                [path.resolve(dirname, "fixtures/basic.ts")],
                [dts()],
                {},
                {
                    entryFileNames: "[name].invalid",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toStrictEqual(["basic.d.invalid", "basic.invalid"]);
        });

        it("same-name output (for JS & DTS)", async () => {
            expect.assertions(1);

            const { chunks } = await rollupBuild(
                [path.resolve(dirname, "fixtures/same-name/index.ts")],
                [dts()],
                {},
                {
                    entryFileNames: "foo.d.ts",
                    preserveModules: true,
                },
            );

            // The entry DTS chunk and JS entry should both use the .d.ts template name
            expect(chunks.some((chunk) => chunk.fileName.endsWith(".d.ts"))).toBe(true);
        });

        it("default chunk name", async () => {
            expect.assertions(3);

            const { chunks, snapshot } = await rollupBuild(
                [path.resolve(dirname, "fixtures/alias/input1.ts"), path.resolve(dirname, "fixtures/alias/input2.ts")],
                [dts({ emitDtsOnly: true })],
                {},
                {
                    entryFileNames: "[name].mjs",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toContain("input1.d.mts");
            expect(chunkNames).toContain("input2.d.mts");

            expect(snapshot).toMatchSnapshot();
        });

        it("custom chunk name", async () => {
            expect.assertions(4);

            const { chunks, snapshot } = await rollupBuild(
                [path.resolve(dirname, "fixtures/dts-multi-input/input1.d.ts"), path.resolve(dirname, "fixtures/dts-multi-input/input2.d.ts")],
                [dts({ emitDtsOnly: true })],
                {},
                {
                    chunkFileNames: "chunks/[hash]-[name].js",
                },
            );

            const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted((a, b) => a.localeCompare(b));

            expect(chunkNames).toContain("input1.d.ts");
            expect(chunkNames).toContain("input2.d.ts");
            expect(chunkNames.some((n) => n.startsWith("chunks/") && n.endsWith(".d.ts"))).toBe(true);

            expect(snapshot).toMatchSnapshot();
        });
    });

    it("type-only export", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild([path.resolve(dirname, "fixtures/type-only-export/index.ts")], [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
    });

    it("cjs exports", async () => {
        expect.assertions(2);

        {
            const { snapshot } = await rollupBuild([path.resolve(dirname, "fixtures/cjs-exports.ts")], [], {}, { exports: "auto", format: "cjs" });

            expect(snapshot).toMatchSnapshot("auto cjs exports");
        }

        {
            const { snapshot } = await rollupBuild([path.resolve(dirname, "fixtures/cjs-exports.ts")], [dts({ cjsDefault: true, emitDtsOnly: true })]);

            expect(snapshot).toMatchSnapshot("dts cjsDefault");
        }
    });

    it("declare module", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/declare-module.ts"), [
            dts({
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("declare relative module", async () => {
        expect.assertions(1);

        const fixture = path.resolve(dirname, "fixtures/declare-relative-module");
        const { snapshot } = await rollupBuild(
            {
                "main-bar": path.resolve(fixture, "bar.ts"),
                "main-baz/index": path.resolve(fixture, "baz/index.ts"),
                "main-foo": path.resolve(fixture, "foo.ts"),
            },
            [dts({ emitDtsOnly: true })],
        );

        expect(snapshot).toMatchSnapshot();
    });

    // https://github.com/sxzz/rolldown-plugin-dts/issues/209
    it("function overloads", async () => {
        expect.assertions(3);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/function-overloads.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).toContain("declare function useConfig(): Config");
        expect(snapshot).toContain("declare function useConfig<T>");
    });

    // TypeScript declaration merging: same-name function/class/interface/const + namespace or value.
    // Repro for yaml (function `visit` + `namespace visit`) and zod (interface `ZodError` + const `ZodError`).
    // Rollup's `assertUniqueExportName` rejects two `export { X }` for the same name, so the plugin
    // must emit exactly one export per bound name and render the merge partners as non-exported
    // declarations that still merge via TS's local declaration-merging rules.
    it("declaration merging emits one export per bound name", async () => {
        expect.assertions(10);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/declaration-merging.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();

        // Each merged name appears in exactly one `export { ... }` specifier.
        const countExported = (name: string) => {
            const exportBlocks = [...snapshot.matchAll(EXPORT_BLOCK_RE)].map((match) => match[0]);
            const nameRegex = new RegExp(String.raw`\b${name}\b`, "g");

            return exportBlocks.reduce((accumulator, block) => accumulator + [...block.matchAll(nameRegex)].length, 0);
        };

        expect(countExported("visit")).toBe(1);
        expect(countExported("ZodError")).toBe(1);
        expect(countExported("Box")).toBe(1);

        // Both declaration partners are still rendered in the output (merge semantics preserved).
        expect(snapshot).toContain("declare function visit");
        expect(snapshot).toContain("namespace visit");
        expect(snapshot).toContain("interface ZodError");
        expect(snapshot).toContain("declare const ZodError");
        expect(snapshot).toContain("declare class Box");
        expect(snapshot).toContain("namespace Box");
    });

    it("should error when file import cannot be found", async () => {
        expect.assertions(1);

        await expect(() =>
            rollupBuild(path.resolve(dirname, "fixtures/unresolved-import/ts.ts"), [
                dts({
                    emitDtsOnly: true,
                }),
            ]),
        ).rejects.toThrow(MISSING_FILE_RE);
    });

    it("banner", async () => {
        expect.assertions(3);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/minimal.ts"), [
            dts({
                banner: "/* My Banner */",
                emitDtsOnly: true,
                footer: (chunk) => `/* My Footer ${chunk.fileName} */`,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).toContain("/* My Banner */\n");
        expect(snapshot).toContain("\n/* My Footer minimal.d.ts */");
    });

    it("manualChunks", async () => {
        expect.assertions(2);

        const { chunks, snapshot } = await rollupBuild(
            path.resolve(dirname, "fixtures/manual-chunk/entry.ts"),
            [dts({ emitDtsOnly: true })],
            {},
            {
                manualChunks(id) {
                    if (id.includes("shared1"))
                        return "shared1-chunk.d";

                    return undefined;
                },
            },
        );

        expect(snapshot).toMatchSnapshot();
        expect(chunks).toHaveLength(2);
    });

    // codeSplitting is a rolldown-specific option not available in rollup
    // eslint-disable-next-line vitest/no-disabled-tests -- codeSplitting is a rolldown-only output option absent from rollup; kept skipped (not deleted) so the intended behavior stays documented for a future rolldown-based runner
    it.skip("codeSplitting", async () => {
        expect.assertions(2);

        const { chunks, snapshot } = await rollupBuild(
            path.resolve(dirname, "fixtures/manual-chunk/entry.ts"),
            [dts({ emitDtsOnly: true })],
            {},
            {
                manualChunks(id: string) {
                    if (id.includes("shared1"))
                        return "shared1-chunk.d";

                    return undefined;
                },
            },
        );

        expect(snapshot).toMatchSnapshot();
        expect(chunks).toHaveLength(2);
    });

    it("re-export from lib", async () => {
        expect.assertions(3);

        const cwd = path.resolve(dirname, "fixtures/re-export-lib");
        const { snapshot: onlyA } = await rollupBuild(path.resolve(cwd, "a.ts"), [dts({ emitDtsOnly: true })]);
        const { snapshot: onlyB } = await rollupBuild(path.resolve(cwd, "b.ts"), [dts({ emitDtsOnly: true })]);
        const { snapshot: both } = await rollupBuild([path.resolve(cwd, "a.ts"), path.resolve(cwd, "b.ts")], [dts({ emitDtsOnly: true })]);

        expect(onlyA).toMatchSnapshot("onlyA");
        expect(onlyB).toMatchSnapshot("onlyB");
        expect(both).toMatchSnapshot("both");
    });

    it("cyclic import", async () => {
        expect.assertions(4);

        const cwd = path.resolve(dirname, "fixtures/cyclic-import");
        const { chunks, snapshot } = await rollupBuild([path.resolve(cwd, "a.ts"), path.resolve(cwd, "b.ts")], [dts({ emitDtsOnly: true })]);

        // Both entries are DTS files
        expect(chunks.every((c) => c.fileName.endsWith(".d.ts"))).toBe(true);
        // All exported types from a.ts and b.ts must be present in the combined output
        // (exact structure is non-deterministic due to rollup's cyclic resolution order)
        expect(snapshot).toContain("SomeInterface");
        expect(snapshot).toContain("SomeBoolean");
        expect(snapshot).toContain("SomeClass");
    });

    it("side effects", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(
            path.resolve(dirname, "fixtures/side-effects/index.ts"),
            [dts({ emitDtsOnly: true, sideEffects: true })],
            {},
            { preserveModules: true },
        );

        expect(snapshot).toMatchSnapshot();
    });

    // Regression for sxzz/rolldown-plugin-dts#231: with a single entry whose imports
    // form a chain (index -> a -> b), emitDtsOnly must keep traversing transitively so
    // every module emits its own declaration. Upstream replaces transformed modules with
    // an `export {}` stub, which severs traversal and drops `b.d.ts`.
    it("emitDtsOnly keeps transitive module traversal (#231)", async () => {
        expect.assertions(4);

        const { chunks } = await rollupBuild(
            path.resolve(dirname, "fixtures/transitive-emit/index.ts"),
            [dts({ emitDtsOnly: true })],
            {},
            { preserveModules: true },
        );

        const fileNames = chunks.map((chunk) => chunk.fileName);

        // index -> a -> b must each produce a declaration; the transitive `b` is the one
        // upstream drops.
        expect(fileNames).toStrictEqual(expect.arrayContaining(["a.d.ts", "b.d.ts", "index.d.ts"]));
        expect(fileNames.some((name) => name.endsWith("a.d.ts"))).toBe(true);
        expect(fileNames.some((name) => name.endsWith("b.d.ts"))).toBe(true);
        expect(chunks.every((chunk) => chunk.fileName.endsWith(".d.ts"))).toBe(true);
    });

    it("infer type parameter", async () => {
        expect.assertions(3);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/infer-type-param.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).toContain("Fn1<U = unknown>");
        expect(snapshot).not.toContain("U$1");
    });

    it("infer false branch", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/infer-false-branch/index.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).toContain("T extends Array<infer U> ? (T extends Array<infer U2> ? U2 : U) : ");
    });

    it("tsgo with custom path", async () => {
        expect.assertions(1);

        const tsgoPath = getTsgoPathFromNodeModules();
        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/basic.ts"), [
            dts({ tsconfig: path.resolve(dirname, "fixtures/basic.tsconfig.json"), tsgo: { path: tsgoPath } }),
        ]);

        expect(snapshot).toMatchSnapshot();
    });

    it("css.ts files", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/css-ts");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
    });

    it("real css imports are externalized", async () => {
        expect.assertions(2);

        const root = path.resolve(dirname, "fixtures/css-real");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).not.toContain(".main");
    });

    it("scss imports are externalized", async () => {
        expect.assertions(2);

        const root = path.resolve(dirname, "fixtures/css-scss");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).not.toContain(".main");
    });

    it("sub namespace", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/sub-namespace.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
    });

    it("deterministic namespace import index", async () => {
        expect.hasAssertions();

        const cwd = path.resolve(dirname, "fixtures/import-type-multi");
        const builds = await Promise.all(
            Array.from({ length: 3 }, async () => {
                const { snapshot } = await rollupBuild(
                    ["a.d.ts", "b.d.ts", "c.d.ts"].map((f) => path.resolve(cwd, f)),
                    [dts({ dtsInput: true, emitDtsOnly: true, tsconfig: path.resolve(cwd, "tsconfig.json") })],
                );

                return snapshot;
            }),
        );

        for (const snapshot of builds) {
            expect(snapshot).toMatchSnapshot();
        }

        expect(builds[0]).toBe(builds[1]);
        expect(builds[1]).toBe(builds[2]);
        expect(builds[0]).toMatch(STUB_LIB_IMPORT_RE);
        expect(builds[0]).not.toContain("_$stub_lib0");
    });

    it("decorators", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/decorator.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
    });

    // https://github.com/sxzz/rolldown-plugin-dts/issues/225
    it("export * preserves type modifiers from re-exports", async () => {
        expect.assertions(3);

        const root = path.resolve(dirname, "fixtures/type-only-star-export");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        // TaskWrapper is a class but re-exported via `export { type TaskWrapper }` — must have type modifier
        expect(snapshot).toMatch(TYPE_TASK_WRAPPER_RE);
        // Task is an interface re-exported via `export { type Task }` — must have type modifier
        expect(snapshot).toMatch(TYPE_TASK_RE);
    });

    // https://github.com/sxzz/rolldown-plugin-dts/issues/225
    it("export * preserves type modifiers from re-exports (tsc)", async () => {
        expect.assertions(3);

        const root = path.resolve(dirname, "fixtures/type-only-star-export");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [
            dts({
                compilerOptions: { isolatedDeclarations: false },
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).toMatch(TYPE_TASK_WRAPPER_RE);
        expect(snapshot).toMatch(TYPE_TASK_RE);
    });

    it("entry option filters which entries emit dts", async () => {
        expect.assertions(1);

        const { chunks } = await rollupBuild(
            [path.resolve(dirname, "fixtures/alias/input1.ts"), path.resolve(dirname, "fixtures/alias/input2.ts")],
            [dts({ emitDtsOnly: true, entry: ["**", "!**/input2.ts"] })],
        );

        const dtsNames = chunks
            .map((chunk) => chunk.fileName)
            .filter((name) => name.endsWith(".d.ts"))
            .toSorted((a, b) => a.localeCompare(b));

        // input1 (a rollup entry) matches the globs → emitted. input2 is a rollup
        // entry but is excluded by `!**/input2.ts`. shared.ts matches `**` but is an
        // internal transitive module, NOT a rollup entry, so it must NOT be promoted.
        expect(dtsNames).toStrictEqual(["input1.d.ts"]);
    });

    it("empty entry array falls back to emitting all entries", async () => {
        expect.assertions(2);

        const { chunks } = await rollupBuild(
            [path.resolve(dirname, "fixtures/alias/input1.ts"), path.resolve(dirname, "fixtures/alias/input2.ts")],
            [dts({ emitDtsOnly: true, entry: [] })],
        );

        const dtsNames = chunks.map((chunk) => chunk.fileName).filter((name) => name.endsWith(".d.ts"));

        // `entry: []` must not silently suppress all output — it falls back to rollup's
        // entry detection, emitting a declaration for every entry.
        expect(dtsNames).toContain("input1.d.ts");
        expect(dtsNames).toContain("input2.d.ts");
    });

    it("warns when entry is set in dtsInput mode", async () => {
        expect.assertions(1);

        const warnings: string[] = [];

        await rollupBuild([path.resolve(dirname, "fixtures/dts-input.d.ts")], [dts({ dtsInput: true, entry: ["**"] })], {
            onwarn(warning) {
                warnings.push(warning.message);
            },
        });

        expect(warnings.some((warning) => warning.includes("`entry` option has no effect in `dtsInput` mode"))).toBe(true);
    });

    // https://github.com/sxzz/rolldown-plugin-dts/pull/242 — type-only-ness must
    // propagate across a multi-hop re-export chain regardless of module order.
    it("preserves type modifier across a multi-hop re-export chain", async () => {
        expect.assertions(1);

        const root = path.resolve(dirname, "fixtures/type-only-reexport-chain");
        const { snapshot } = await rollupBuild(path.resolve(root, "barrel.ts"), [dts({ emitDtsOnly: true })]);

        // barrel re-exports Foo from mid, which `export type`s it from types. The
        // final re-export must keep the `type` modifier.
        expect(snapshot).toMatch(TYPE_FOO_RE);
    });

    // https://github.com/sxzz/rolldown-plugin-dts/pull/246
    it("tracks dependencies in computed keys of method signatures", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/method-signature/index.ts"), [
            dts({ compilerOptions: { isolatedDeclarations: false }, emitDtsOnly: true }),
        ]);

        // The const used in the computed method-signature key (`[mod.b](): string`)
        // must be tracked as a dependency so it survives tree-shaking. Without the
        // fix, `b` would be dropped and the `[b]()` key would dangle.
        expect(snapshot).toContain("[b](): string");
        expect(snapshot).toContain("declare const b = \"bb\"");
    });

    it("warns for CommonJS dts input syntax", async () => {
        expect.assertions(2);

        const warnings: string[] = [];

        await rollupBuild([path.resolve(dirname, "__fixtures__/rollup-plugin-dts/issue-89-import-equals/index.d.ts")], [dts({ dtsInput: true })], {
            onwarn(warning) {
                warnings.push(warning.message);
            },
        });

        expect(warnings.some((warning) => warning.includes("uses CommonJS dts syntax"))).toBe(true);
        expect(warnings.join("\n")).toContain("does not support reliably bundling CommonJS dts input");
    });

    // Regression: `import A = NS.Inner` (entity-name reference, not `= require(...)`) used to
    // leave raw TS in the fake-JS output and make rollup die with `Expected ',', got '='`.
    // It must now be rewritten to a type alias so the bundle round-trips.
    it("handles `import A = NS.Inner` entity-name import-equals without crashing", async () => {
        expect.assertions(2);

        const { snapshot } = await rollupBuild([path.resolve(dirname, "fixtures/import-equals-entity.d.ts")], [dts({ dtsInput: true })], {});

        expect(snapshot).not.toContain("import Aliased =");
        expect(snapshot).toContain("Aliased");
    });

    // Regression: `export = NS.thing` (non-identifier expression) used to fall through and make
    // rollup fail with `Expected '{', got '='`. It must now be rewritten to a default export.
    it("handles `export = NS.thing` non-identifier export-assignment without crashing", async () => {
        expect.assertions(1);

        const { snapshot } = await rollupBuild([path.resolve(dirname, "fixtures/export-assignment-entity.d.ts")], [dts({ dtsInput: true })], {});

        expect(snapshot).not.toContain("export = ");
    });

    it("tsgo `enabled: false` disables tsgo", () => {
        expect.assertions(2);

        expect(resolveOptions({ tsgo: { enabled: false } }).tsgo).toBe(false);
        expect(resolveOptions({ tsgo: { enabled: true, path: "custom-tsgo" } }).tsgo).toStrictEqual({ path: "custom-tsgo" });
    });

    describe("generator option", () => {
        it("infers the generator from the legacy boolean options", () => {
            expect.assertions(3);

            expect(resolveOptions({}).generator).toBe("tsc");
            expect(resolveOptions({ compilerOptions: { isolatedDeclarations: true } }).generator).toBe("oxc");
            expect(resolveOptions({ tsgo: true }).generator).toBe("tsgo");
        });

        it("selects the backend explicitly, overriding the inferred default", () => {
            expect.assertions(4);

            // `isolatedDeclarations` would otherwise infer oxc; the explicit generator wins.
            const resolved = resolveOptions({ compilerOptions: { isolatedDeclarations: true }, generator: "tsc" });

            expect(resolved.generator).toBe("tsc");
            expect(resolved.oxc).toBe(false);

            // Explicit oxc without `isolatedDeclarations` still produces a usable oxc config.
            // `tsconfig: false` isolates the assertion from this repo's own tsconfig.
            const oxcResolved = resolveOptions({ generator: "oxc", tsconfig: false });

            expect(oxcResolved.generator).toBe("oxc");
            expect(oxcResolved.oxc).toStrictEqual({ sourcemap: false, stripInternal: false });
        });

        it("forces tsc for vue and warns that the generator is ignored", () => {
            expect.assertions(3);

            const warn = vi.fn<(...args: unknown[]) => void>();
            const resolved = resolveOptions({
                generator: "oxc",
                logger: { error: vi.fn<(...args: unknown[]) => void>(), info: vi.fn<(...args: unknown[]) => void>(), warn },
                vue: true,
            });

            expect(resolved.generator).toBe("tsc");
            expect(resolved.oxc).toBe(false);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("is ignored"));
        });

        it("defaults the logger to console and passes a custom one through", () => {
            expect.assertions(2);

            const logger = {
                error: vi.fn<(...args: unknown[]) => void>(),
                info: vi.fn<(...args: unknown[]) => void>(),
                warn: vi.fn<(...args: unknown[]) => void>(),
            };

            expect(resolveOptions({}).logger).toBe(console);
            expect(resolveOptions({ logger }).logger).toBe(logger);
        });
    });

    it("jSDoc comments in types are preserved when tsc emits them", async () => {
        expect.assertions(4);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/jsdoc-type-comments.ts"), [
            dts({
                compilerOptions: {
                    isolatedDeclarations: false,
                    removeComments: false,
                },
                emitDtsOnly: true,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
        // Each JSDoc comment should be preserved on its own line before the property
        expect(snapshot).toContain("/** Comment A1 */");
        expect(snapshot).toContain("/** Comment A2 */");
        expect(snapshot).toContain("/** Comment B1 */");
    });

    it("triple-slash directives are preserved and deduplicated in dtsInput mode", async () => {
        expect.assertions(3);

        const root = path.resolve(dirname, "fixtures/triple-slash-directives");
        const { snapshot } = await rollupBuild(path.resolve(root, "input.d.ts"), [
            dts({
                dtsInput: true,
                emitDtsOnly: true,
                sourcemap: false,
                tsconfig: false,
            }),
        ]);

        expect(snapshot).toMatchSnapshot();
        // Directive should appear in the output
        expect(snapshot).toContain("/// <reference types=\"node\" />");

        // Should be deduplicated — only one occurrence despite both input.d.ts and types-input.d.ts having it
        const matches = snapshot.match(TRIPLE_SLASH_NODE_RE);

        expect(matches).toHaveLength(1);
    });

    it("module augmentation files preserve export {} to remain modules", async () => {
        expect.assertions(4);

        const root = path.resolve(dirname, "fixtures/module-augmentation");
        const { snapshot } = await rollupBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        // The declare module augmentation must be present
        expect(snapshot).toContain("declare module");
        expect(snapshot).toContain("ButtonPropsSizeOverrides");
        // The chunk containing the augmentation must have export {} or another export to be a module
        // Without it, TypeScript won't apply the module augmentation
        expect(snapshot).toMatch(EXPORT_BRACE_RE);
    });

    it("module augmentation-only file preserves export {} as module marker", async () => {
        expect.assertions(4);

        const { snapshot } = await rollupBuild(path.resolve(dirname, "fixtures/module-augmentation-only.ts"), [dts({ emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
        expect(snapshot).toContain("declare module");
        expect(snapshot).toContain("ButtonPropsSizeOverrides");
        // Must have export {} to be treated as a module by TypeScript
        expect(snapshot).toMatch(EXPORT_BRACE_RE);
    });
});
