import path from "node:path";
import { fileURLToPath } from "node:url";

import { rolldownBuild } from "@sxzz/test-utils";
import { expect } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

it("basic", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/basic.ts"),
        [dts()],
    );

    expect(snapshot).toMatchSnapshot();
});

it("tsx", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/tsx.tsx"),
        [dts()],
    );

    expect(snapshot).toMatchSnapshot();
});

it("resolve dependencies", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/resolve-dep.ts"),
        [
            dts({
                emitDtsOnly: true,
                isolatedDeclarations: true,
                resolve: ["get-tsconfig"],
            }),
        ],
    );

    expect(snapshot).contain("type TsConfigResult");
    expect(snapshot).not.contain("node_modules/rolldown");
});

it("resolve dts", async () => {
    const { snapshot } = await rolldownBuild(
        path.resolve(dirname, "fixtures/resolve-dts/index.ts"),
        [dts()],
    );

    expect(snapshot).matchSnapshot();
});

// Test alias mapping based on rolldown input option
it("input alias", async () => {
    const root = path.resolve(dirname, "fixtures/alias");
    const { chunks, snapshot } = await rolldownBuild(
        null!,
        [dts({ emitDtsOnly: false })],
        {
            cwd: root,
            // A mapping from output chunk names to input files. This mapping should
            // be used in both JS and DTS outputs.
            input: {
                output1: "input1.ts",
                "output2/index": "input2.ts",
            },
        },
    );
    const fileNames = chunks.map((chunk) => chunk.fileName).sort();

    // The JS output and DTS output should have the same structure
    expect(fileNames).toContain("output1.d.ts");
    expect(fileNames).toContain("output1.js");
    expect(fileNames).toContain("output2/index.d.ts");
    expect(fileNames).toContain("output2/index.js");

    expect(snapshot).toMatchSnapshot();
});

it("isolated declaration error", async () => {
    const error = await rolldownBuild(
        path.resolve(dirname, "fixtures/isolated-decl-error.ts"),
        [
            dts({
                emitDtsOnly: true,
                isolatedDeclarations: true,
            }),
        ],
    ).catch((error: any) => error);

    expect(String(error)).toContain(
        `Function must have an explicit return type annotation with --isolatedDeclarations.`,
    );
    expect(String(error)).toContain(`export function fn() {`);
});

it("paths", async () => {
    const root = path.resolve(dirname, "fixtures/paths");
    const { snapshot } = await rolldownBuild(path.resolve(root, "index.ts"), [
        dts({
            emitDtsOnly: true,
            isolatedDeclarations: true,
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
                    if (id.startsWith("node:")) { return { external: true, id, moduleSideEffects: false }; }
                },
            },
        ],
        { treeshake: true },
    );

    expect(snapshot).matchSnapshot();
});

it("dts input", async () => {
    const { snapshot } = await rolldownBuild(null!, [dts({ dtsInput: true })], {
        input: {
            index: path.resolve(dirname, "fixtures/dts-input.d.ts"),
        },
    });

    expect(snapshot).toMatchSnapshot();
});

it("same-name output", async () => {
    const { chunks } = await rolldownBuild(
        [path.resolve(dirname, "fixtures/same-name/index.ts")],
        [dts()],
        {},
        { entryFileNames: "foo.d.ts", preserveModules: true },
    );

    expect(chunks.every((chunk) => chunk.fileName.endsWith(".d.ts"))).toBe(true);
});
