import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SourceMapConsumer } from "@jridgewell/source-map";
import { expectFilesSnapshot, rolldownBuild } from "@sxzz/test-utils";
import { build } from "rolldown";
import { beforeAll, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(dirname, "temp");
const input = path.resolve(dirname, "fixtures/source-map/index.ts");
const tsconfig = path.resolve(dirname, "fixtures/source-map/tsconfig.json");

beforeAll(async () => {
    await rm(tempDir, { force: true, recursive: true });
});

function validateSourceMap(sourcemap: string) {
    const map = JSON.parse(sourcemap);
    const consumer = new SourceMapConsumer(map);

    expect(consumer.version).toBe(3);
    expect(consumer.names).toEqual([]);
    expect(consumer.file).toBe("index.d.ts");
    expect(consumer.sourcesContent ?? []).toHaveLength(0);
    expect(consumer.sources).toEqual([expect.stringContaining("fixtures/source-map/mod.ts"), expect.stringContaining("fixtures/source-map/index.ts")]);

    const mappings: any[] = [];

    consumer.eachMapping((mapping) => {
        mappings.push(mapping);
    });

    expect(mappings.length).toBeGreaterThan(0);
}

it("oxc", async () => {
    const dir = path.join(tempDir, "source-map-oxc");

    await build({
        input,
        output: { dir },
        plugins: [
            dts({
                emitDtsOnly: true,
                oxc: true,
                sourcemap: true,
                tsconfig,
            }),
        ],
        write: true,
    });
    await expectFilesSnapshot(dir, "__snapshots__/source-map-oxc.md");
    const sourcemap = await readFile(path.resolve(dir, "index.d.ts.map"), "utf8");

    validateSourceMap(sourcemap);
});

it("tsc", async () => {
    const dir = path.join(tempDir, "source-map-tsc");

    await build({
        input,
        output: { dir },
        plugins: [
            dts({
                emitDtsOnly: true,
                oxc: false,
                sourcemap: true,
                tsconfig,
            }),
        ],
        write: true,
    });
    await expectFilesSnapshot(dir, "__snapshots__/source-map-tsc.md");
    const sourcemap = await readFile(path.resolve(dir, "index.d.ts.map"), "utf8");

    validateSourceMap(sourcemap);
});

it("tsgo", async () => {
    const dir = path.join(tempDir, "source-map-tsgo");

    await build({
        input,
        output: { dir },
        plugins: [
            dts({
                emitDtsOnly: true,
                sourcemap: true,
                tsconfig,
                tsgo: true,
            }),
        ],
        write: true,
    });
    await expectFilesSnapshot(dir, "__snapshots__/source-map-tsgo.md");
    const sourcemap = await readFile(path.resolve(dir, "index.d.ts.map"), "utf8");

    validateSourceMap(sourcemap);
});

it("disable dts source map only", async () => {
    const { chunks } = await rolldownBuild(input, [dts({ sourcemap: false })], {}, { sourcemap: true });

    expect(chunks.map((chunk) => chunk.fileName)).toMatchInlineSnapshot(`
    [
      "index.d.ts",
      "index.js",
      "chunk-BYypO7fO.js",
      "index.js.map",
    ]
  `);
});
