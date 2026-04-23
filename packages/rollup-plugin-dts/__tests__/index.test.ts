import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild as rolldownBuild } from "@sxzz/test-utils";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index.js";
import { getTsgoPathFromNodeModules } from "../src/tsgo.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

it("basic", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/basic.ts"), [dts()]);

    expect(snapshot).toMatchSnapshot();
});

it("tsx", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/tsx.tsx"), [dts()]);

    expect(snapshot).toMatchSnapshot();
});

it("resolve dependencies", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/resolve-dep.ts"), [
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
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/resolve-dts/index.ts"), [dts()]);

    expect(snapshot).matchSnapshot();
});

// Test alias mapping based on rollup input option
it("input alias", async () => {
    const root = path.resolve(dirname, "fixtures/alias");
    const { chunks, snapshot } = await rolldownBuild(
        {
            output1: path.resolve(root, "input1.ts"),
            "output2/index": path.resolve(root, "input2.ts"),
        },
        [dts({ emitDtsOnly: false })],
    );
    const fileNames = chunks.map((chunk) => chunk.fileName).toSorted();

    // The JS output and DTS output should have the same structure
    expect(fileNames).toContain("output1.d.ts");
    expect(fileNames).toContain("output1.js");
    expect(fileNames).toContain("output2/index.d.ts");
    expect(fileNames).toContain("output2/index.js");

    expect(snapshot).toMatchSnapshot();
});

it("isolated declaration error", async () => {
    const error = await rolldownBuild(path.resolve(dirname, "fixtures/isolated-decl-error.ts"), [
        dts({
            emitDtsOnly: true,
            oxc: true,
        }),
    ]).catch((error: any) => error);

    expect(String(error)).toContain(`Function must have an explicit return type annotation with --isolatedDeclarations.`);
    expect(String(error)).toContain(`export function fn() {`);
});

it("paths", async () => {
    const root = path.resolve(dirname, "fixtures/paths");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [
        dts({
            emitDtsOnly: true,
            oxc: true,
            tsconfig: path.resolve(root, "tsconfig.json"),
        }),
    ]);

    expect(snapshot).toMatchSnapshot();
});

it("tree-shaking", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/tree-shaking/index.ts"),
        [
            dts(),
            {
                name: "external-node",
                resolveId(id) {
                    if (id.startsWith("node:"))
                        return { external: true, id, moduleSideEffects: false };

                    return null;
                },
            },
        ],
        { treeshake: true },
    );

    expect(snapshot).matchSnapshot();
});

describe("dts input", () => {
    it("input array", async () => {
        const { chunks, snapshot } = await rolldownBuild([path.resolve(dirname, "fixtures/dts-input.d.ts")], [dts({ dtsInput: true })], {});

        expect(chunks[0].fileName).toBe("dts-input.d.ts");
        expect(snapshot).toMatchSnapshot();
    });

    it("input object", async () => {
        const { chunks, snapshot } = await rolldownBuild({ index: path.resolve(dirname, "fixtures/dts-input.d.ts") }, [dts({ dtsInput: true })]);

        expect(chunks[0].fileName).toBe("index.d.ts");
        expect(snapshot).toMatchSnapshot();
    });

    it(".d in chunk name", async () => {
        const { chunks } = await rolldownBuild({ "index.d": path.resolve(dirname, "fixtures/dts-input.d.ts") }, [dts({ dtsInput: true })]);

        expect(chunks[0].fileName).toBe("index.d.ts");
    });

    it("full extension in chunk name", async () => {
        const { chunks } = await rolldownBuild({ "index.d.mts": path.resolve(dirname, "fixtures/dts-input.d.ts") }, [dts({ dtsInput: true })]);

        expect(chunks[0].fileName).toBe("index.d.mts");
    });

    it("custom entryFileNames with .d", async () => {
        const { chunks } = await rolldownBuild(
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
        const { chunks } = await rolldownBuild(
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
        const { chunks } = await rolldownBuild(
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
        const { chunks } = await rolldownBuild(
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
        const { chunks } = await rolldownBuild(
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
        const { chunks, snapshot } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/dts-multi-input/input1.d.ts"), path.resolve(dirname, "fixtures/dts-multi-input/input2.d.ts")],
            [dts({ dtsInput: true })],
            {},
            {
                entryFileNames: "[name].mts",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toContain("input1.d.mts");
        expect(chunkNames).toContain("input2.d.mts");
        expect(chunkNames.some((n) => n.endsWith(".d.ts") && !n.startsWith("input"))).toBe(true);

        expect(snapshot).toMatchSnapshot();
    });

    it("custom chunk name", async () => {
        const { chunks, snapshot } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/dts-multi-input/input1.d.ts"), path.resolve(dirname, "fixtures/dts-multi-input/input2.d.ts")],
            [dts({ dtsInput: true })],
            {},
            {
                chunkFileNames: "chunks/[hash]-[name].ts",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toContain("input1.d.ts");
        expect(chunkNames).toContain("input2.d.ts");
        expect(chunkNames.some((n) => n.startsWith("chunks/") && n.endsWith(".d.ts"))).toBe(true);

        expect(snapshot).toMatchSnapshot();
    });
});

describe("entryFileNames", () => {
    it(".mjs -> .d.mts", async () => {
        const { chunks } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/basic.ts")],
            [dts()],
            {},
            {
                entryFileNames: "[name].mjs",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toStrictEqual(["basic.d.mts", "basic.mjs"]);
    });

    it(".cjs -> .d.cts", async () => {
        const { chunks } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/basic.ts")],
            [dts()],
            {},
            {
                entryFileNames: "[name].cjs",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toStrictEqual(["basic.cjs", "basic.d.cts"]);
    });

    it(".mjs -> .d.mts with custom chunk name", async () => {
        const { chunks } = await rolldownBuild(
            { custom: path.resolve(dirname, "fixtures/basic.ts") },
            [dts()],
            {},
            {
                entryFileNames: "[name].mjs",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toStrictEqual(["custom.d.mts", "custom.mjs"]);
    });

    it("preserves invalid extension", async () => {
        const { chunks } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/basic.ts")],
            [dts()],
            {},
            {
                entryFileNames: "[name].invalid",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toStrictEqual(["basic.d.invalid", "basic.invalid"]);
    });

    it("same-name output (for JS & DTS)", async () => {
        const { chunks } = await rolldownBuild(
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
        const { chunks, snapshot } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/alias/input1.ts"), path.resolve(dirname, "fixtures/alias/input2.ts")],
            [dts({ emitDtsOnly: true })],
            {},
            {
                entryFileNames: "[name].mjs",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toContain("input1.d.mts");
        expect(chunkNames).toContain("input2.d.mts");

        expect(snapshot).toMatchSnapshot();
    });

    it("custom chunk name", async () => {
        const { chunks, snapshot } = await rolldownBuild(
            [path.resolve(dirname, "fixtures/dts-multi-input/input1.d.ts"), path.resolve(dirname, "fixtures/dts-multi-input/input2.d.ts")],
            [dts({ emitDtsOnly: true })],
            {},
            {
                chunkFileNames: "chunks/[hash]-[name].js",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).toSorted();

        expect(chunkNames).toContain("input1.d.ts");
        expect(chunkNames).toContain("input2.d.ts");
        expect(chunkNames.some((n) => n.startsWith("chunks/") && n.endsWith(".d.ts"))).toBe(true);

        expect(snapshot).toMatchSnapshot();
    });
});

it("type-only export", async () => {
    const { snapshot } = await rolldownBuild([path.resolve(dirname, "fixtures/type-only-export/index.ts")], [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
});

it("cjs exports", async () => {
    {
        const { snapshot } = await rolldownBuild([path.resolve(dirname, "fixtures/cjs-exports.ts")], [], {}, { exports: "auto", format: "cjs" });

        expect(snapshot).toMatchSnapshot();
    }

    {
        const { snapshot } = await rolldownBuild([path.resolve(dirname, "fixtures/cjs-exports.ts")], [dts({ cjsDefault: true, emitDtsOnly: true })]);

        expect(snapshot).toMatchSnapshot();
    }
});

it("declare module", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/declare-module.ts"), [
        dts({
            emitDtsOnly: true,
        }),
    ]);

    expect(snapshot).toMatchSnapshot();
});

it("declare relative module", async () => {
    const fixture = path.resolve(dirname, "fixtures/declare-relative-module");
    const { snapshot } = await rolldownBuild(
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
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/function-overloads.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).toContain("declare function useConfig(): Config");
    expect(snapshot).toContain("declare function useConfig<T>");
});

it("should error when file import cannot be found", async () => {
    await expect(() =>
        rolldownBuild(path.resolve(dirname, "fixtures/unresolved-import/ts.ts"), [
            dts({
                emitDtsOnly: true,
            }),
        ]),
    ).rejects.toThrowError(/Could not resolve ['"]\.\/missing-file['"]/u);
});

it("banner", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/minimal.ts"), [
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
    const { chunks, snapshot } = await rolldownBuild(
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
it.skip("codeSplitting", async () => {
    const { chunks, snapshot } = await rolldownBuild(
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
    const cwd = path.resolve(dirname, "fixtures/re-export-lib");
    const { snapshot: onlyA } = await rolldownBuild(path.resolve(cwd, "a.ts"), [dts({ emitDtsOnly: true })]);
    const { snapshot: onlyB } = await rolldownBuild(path.resolve(cwd, "b.ts"), [dts({ emitDtsOnly: true })]);
    const { snapshot: both } = await rolldownBuild([path.resolve(cwd, "a.ts"), path.resolve(cwd, "b.ts")], [dts({ emitDtsOnly: true })]);

    expect(onlyA).toMatchSnapshot("onlyA");
    expect(onlyB).toMatchSnapshot("onlyB");
    expect(both).toMatchSnapshot("both");
});

it("cyclic import", async () => {
    const cwd = path.resolve(dirname, "fixtures/cyclic-import");
    const { chunks, snapshot } = await rolldownBuild([path.resolve(cwd, "a.ts"), path.resolve(cwd, "b.ts")], [dts({ emitDtsOnly: true })]);

    // Both entries are DTS files
    expect(chunks.every((c) => c.fileName.endsWith(".d.ts"))).toBe(true);
    // All exported types from a.ts and b.ts must be present in the combined output
    // (exact structure is non-deterministic due to rollup's cyclic resolution order)
    expect(snapshot).toContain("SomeInterface");
    expect(snapshot).toContain("SomeBoolean");
    expect(snapshot).toContain("SomeClass");
});

it("side effects", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/side-effects/index.ts"),
        [dts({ emitDtsOnly: true, sideEffects: true })],
        {},
        { preserveModules: true },
    );

    expect(snapshot).toMatchSnapshot();
});

it("infer type parameter", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/infer-type-param.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).toContain("Fn1<U = unknown>");
    expect(snapshot).not.toContain("U$1");
});

it("infer false branch", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/infer-false-branch/index.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).toContain("T extends Array<infer U> ? (T extends Array<infer U2> ? U2 : U) : ");
});

it("tsgo with custom path", async () => {
    const tsgoPath = await getTsgoPathFromNodeModules();
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/basic.ts"), [
        dts({ tsconfig: path.resolve(dirname, "fixtures/basic.tsconfig.json"), tsgo: { path: tsgoPath } }),
    ]);

    expect(snapshot).toMatchSnapshot();
});

it("css.ts files", async () => {
    const root = path.resolve(dirname, "fixtures/css-ts");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
});

it("real css imports are externalized", async () => {
    const root = path.resolve(dirname, "fixtures/css-real");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).not.toContain(".main");
});

it("scss imports are externalized", async () => {
    const root = path.resolve(dirname, "fixtures/css-scss");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).not.toContain(".main");
});

it("sub namespace", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/sub-namespace.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
});

it("deterministic namespace import index", async () => {
    const cwd = path.resolve(dirname, "fixtures/import-type-multi");
    const results: string[] = [];

    for (let i = 0; i < 3; i++) {
        const { snapshot } = await rolldownBuild(
            ["a.d.ts", "b.d.ts", "c.d.ts"].map((f) => path.resolve(cwd, f)),
            [dts({ dtsInput: true, emitDtsOnly: true, tsconfig: path.resolve(cwd, "tsconfig.json") })],
        );

        results.push(snapshot);

        expect(snapshot).toMatchSnapshot();
    }

    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
    expect(results[0]).toMatch(/import \* as _\$stub_lib from ['"]stub_lib['"]/u);
    expect(results[0]).not.toContain("_$stub_lib0");
});

it("decorators", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/decorator.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
});

// https://github.com/sxzz/rolldown-plugin-dts/issues/225
it("export * preserves type modifiers from re-exports", async () => {
    const root = path.resolve(dirname, "fixtures/type-only-star-export");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    // TaskWrapper is a class but re-exported via `export { type TaskWrapper }` — must have type modifier
    expect(snapshot).toMatch(/export\s*\{[^}]*type\s+TaskWrapper/u);
    // Task is an interface re-exported via `export { type Task }` — must have type modifier
    expect(snapshot).toMatch(/export\s*\{[^}]*type\s+Task\b/u);
});

// https://github.com/sxzz/rolldown-plugin-dts/issues/225
it("export * preserves type modifiers from re-exports (tsc)", async () => {
    const root = path.resolve(dirname, "fixtures/type-only-star-export");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [
        dts({
            compilerOptions: { isolatedDeclarations: false },
            emitDtsOnly: true,
        }),
    ]);

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).toMatch(/export\s*\{[^}]*type\s+TaskWrapper/u);
    expect(snapshot).toMatch(/export\s*\{[^}]*type\s+Task\b/u);
});

it("JSDoc comments in types are preserved when tsc emits them", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/jsdoc-type-comments.ts"), [
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
    const root = path.resolve(dirname, "fixtures/triple-slash-directives");
    const { snapshot } = await rolldownBuild(path.resolve(root, "input.d.ts"), [
        dts({
            dtsInput: true,
            emitDtsOnly: true,
            sourcemap: false,
            tsconfig: false,
        }),
    ]);

    expect(snapshot).toMatchSnapshot();
    // Directive should appear in the output
    expect(snapshot).toContain('/// <reference types="node" />');
    // Should be deduplicated — only one occurrence despite both input.d.ts and types-input.d.ts having it
    const matches = snapshot.match(/\/\/\/ <reference types="node" \/>/g);

    expect(matches).toHaveLength(1);
});

it("module augmentation files preserve export {} to remain modules", async () => {
    const root = path.resolve(dirname, "fixtures/module-augmentation");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [dts({ emitDtsOnly: true })]);

    expect(snapshot).toMatchSnapshot();
    // The declare module augmentation must be present
    expect(snapshot).toContain("declare module");
    expect(snapshot).toContain("ButtonPropsSizeOverrides");
    // The chunk containing the augmentation must have export {} or another export to be a module
    // Without it, TypeScript won't apply the module augmentation
    expect(snapshot).toMatch(/export\s*\{/u);
});

it("module augmentation-only file preserves export {} as module marker", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/module-augmentation-only.ts"),
        [dts({ emitDtsOnly: true })],
    );

    expect(snapshot).toMatchSnapshot();
    expect(snapshot).toContain("declare module");
    expect(snapshot).toContain("ButtonPropsSizeOverrides");
    // Must have export {} to be treated as a module by TypeScript
    expect(snapshot).toMatch(/export\s*\{/u);
});
