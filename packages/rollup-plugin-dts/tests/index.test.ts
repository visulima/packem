import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldownBuild } from "@sxzz/test-utils";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index.ts";

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
            resolve: ["get-tsconfig"],
        }),
    ]);

    expect(snapshot).contain("type TsConfigResult");
    expect(snapshot).not.contain("node_modules/rolldown");
});

it("resolve dts", async () => {
    const { snapshot } = await rolldownBuild(path.resolve(dirname, "fixtures/resolve-dts/index.ts"), [dts()]);

    expect(snapshot).matchSnapshot();
});

// Test alias mapping based on rolldown input option
it("input alias", async () => {
    const root = path.resolve(dirname, "fixtures/alias");
    const { chunks, snapshot } = await rolldownBuild(null!, [dts({ emitDtsOnly: false })], {
        cwd: root,
        // A mapping from output chunk names to input files. This mapping should
        // be used in both JS and DTS outputs.
        input: {
            output1: "input1.ts",
            "output2/index": "input2.ts",
        },
    });
    const fileNames = chunks.map((chunk) => chunk.fileName).sort();

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
        const { chunks, snapshot } = await rolldownBuild(null!, [dts({ dtsInput: true })], {
            input: {
                index: path.resolve(dirname, "fixtures/dts-input.d.ts"),
            },
        });

        expect(chunks[0].fileName).toBe("index.d.ts");
        expect(snapshot).toMatchSnapshot();
    });

    it(".d in chunk name", async () => {
        const { chunks } = await rolldownBuild(null!, [dts({ dtsInput: true })], {
            input: {
                "index.d": path.resolve(dirname, "fixtures/dts-input.d.ts"),
            },
        });

        expect(chunks[0].fileName).toBe("index.d.ts");
    });

    it("full extension in chunk name", async () => {
        const { chunks } = await rolldownBuild(null!, [dts({ dtsInput: true })], {
            input: {
                "index.d.mts": path.resolve(dirname, "fixtures/dts-input.d.ts"),
            },
        });

        expect(chunks[0].fileName).toBe("index.d.mts");
    });

    it("custom entryFileNames with .d", async () => {
        const { chunks } = await rolldownBuild(
            null!,
            [dts({ dtsInput: true })],
            {
                input: {
                    index: path.resolve(dirname, "fixtures/dts-input.d.ts"),
                },
            },
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
            null!,
            [dts({ dtsInput: true })],
            {
                input: {
                    index: path.resolve(dirname, "fixtures/dts-input.d.ts"),
                },
            },
            {
                entryFileNames: () => "[name].mts",
            },
        );

        expect(chunks[0].fileName).toBe("index.d.mts");
    });

    it("invalid entryFileNames gets overridden with stripped .d", async () => {
        const { chunks } = await rolldownBuild(
            null!,
            [dts({ dtsInput: true })],
            {
                input: {
                    "index.d": path.resolve(dirname, "fixtures/dts-input.d.ts"),
                },
            },
            {
                entryFileNames: "[name].invalid",
            },
        );

        expect(chunks[0].fileName).toBe("index.d.ts");
    });

    it("invalid entryFileNames gets overridden and preserves subextension", async () => {
        const { chunks } = await rolldownBuild(
            null!,
            [dts({ dtsInput: true })],
            {
                input: {
                    "index.asdf": path.resolve(dirname, "fixtures/dts-input.d.ts"),
                },
            },
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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

        expect(chunkNames).toStrictEqual(["input1.d.mts", "input2.d.mts", "types-VwSK8P_f.d.ts"]);

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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

        expect(chunkNames).toStrictEqual(["chunks/DqALGAwS-types.d.ts", "input1.d.ts", "input2.d.ts"]);

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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

        expect(chunkNames).toStrictEqual(["basic.cjs", "basic.d.cts"]);
    });

    it(".mjs -> .d.mts with custom chunk name", async () => {
        const { chunks } = await rolldownBuild(
            null!,
            [dts()],
            {
                input: {
                    custom: path.resolve(dirname, "fixtures/basic.ts"),
                },
            },
            {
                entryFileNames: "[name].mjs",
            },
        );

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

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

        expect(chunks.every((chunk) => chunk.fileName.endsWith(".d.ts"))).toBe(true);
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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

        expect(chunkNames).toStrictEqual(["input1.d.mts", "input2-CzdQ8V-e.d.ts", "input2.d.mts"]);

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

        const chunkNames = chunks.map((chunk) => chunk.fileName).sort();

        expect(chunkNames).toStrictEqual(["chunks/DqALGAwS-types.d.ts", "input1.d.ts", "input2.d.ts"]);

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
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/declare-module.ts"),
        [
            dts({
                emitDtsOnly: true,
            }),
        ],
        { platform: "node" },
    );

    expect(snapshot).toMatchSnapshot();
});

it("should error when file import cannot be found", async () => {
    await expect(() =>
        rolldownBuild(path.resolve(dirname, "fixtures/unresolved-import/ts.ts"), [
            dts({
                emitDtsOnly: true,
            }),
        ]),
    ).rejects.toThrow("Could not resolve './missing-file'");
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
