import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expectFilesSnapshot, rolldownBuild } from "@sxzz/test-utils";
import { build } from "rolldown";
import { beforeAll, expect } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(dirname, "temp");

beforeAll(async () => {
    await rm(tempDir, { force: true, recursive: true });
});

it("oxc", async () => {
    const dir = path.join(tempDir, "source-map-oxc");

    await build({
        input: path.resolve(dirname, "fixtures/basic.ts"),
        output: { dir },
        plugins: [
            dts({
                emitDtsOnly: true,
                isolatedDeclarations: true,
                sourcemap: true,
            }),
        ],
        write: true,
    });
    await expectFilesSnapshot(dir, "__snapshots__/source-map-oxc.md");
});

it("tsc", async () => {
    const dir = path.join(tempDir, "source-map-tsc");

    await build({
        input: path.resolve(dirname, "fixtures/basic.ts"),
        output: { dir },
        plugins: [
            dts({
                emitDtsOnly: true,
                isolatedDeclarations: false,
                sourcemap: true,
            }),
        ],
        write: true,
    });
    await expectFilesSnapshot(dir, "__snapshots__/source-map-tsc.md");
});

it("disable dts source map only", async () => {
    const { chunks } = await rolldownBuild(
        path.resolve(dirname, "fixtures/basic.ts"),
        [dts({ sourcemap: false })],
        {},
        { sourcemap: true },
    );

    expect(chunks.map((chunk) => chunk.fileName)).toMatchInlineSnapshot(`
        [
          "basic.d.ts",
          "basic.js",
          "basic.js.map",
        ]
    `);
});
