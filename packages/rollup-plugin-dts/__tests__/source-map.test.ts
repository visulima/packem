import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { EncodedSourceMap } from "@jridgewell/source-map";
import { SourceMapConsumer } from "@jridgewell/source-map";
import { expectFilesSnapshot, rollupBuild as rolldownBuild } from "@sxzz/test-utils";
import { rollup } from "rollup";
import { beforeAll, describe, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = path.join(dirname, "temp");
const input = path.resolve(dirname, "fixtures/source-map/index.ts");
const tsconfig = path.resolve(dirname, "fixtures/source-map/tsconfig.json");

const validateSourceMap = (sourcemap: string): void => {
    const map = JSON.parse(sourcemap) as EncodedSourceMap;
    const consumer = new SourceMapConsumer(map);

    expect(consumer.version).toBe(3);
    expect(consumer.names).toStrictEqual([]);
    expect(consumer.file).toBe("index.d.ts");
    expect(consumer.sourcesContent ?? []).toHaveLength(0);
    expect(consumer.sources).toStrictEqual([
        expect.stringContaining("fixtures/source-map/mod.ts"),
        expect.stringContaining("fixtures/source-map/index.ts"),
    ]);

    const mappings: unknown[] = [];

    consumer.eachMapping((mapping) => {
        mappings.push(mapping);
    });

    expect(mappings.length).toBeGreaterThan(0);
};

describe("source-map", () => {
    beforeAll(async () => {
        await rm(temporaryDirectory, { force: true, recursive: true });
    });

    it("oxc", async () => {
        const directory = path.join(temporaryDirectory, "source-map-oxc");
        const bundle = await rollup({
            input,
            plugins: [
                dts({
                    emitDtsOnly: true,
                    oxc: true,
                    sourcemap: true,
                    tsconfig,
                }),
            ],
        });

        await bundle.write({ dir: directory, sourcemap: true });
        await expectFilesSnapshot(directory, "__snapshots__/source-map-oxc.md");
        const sourcemap = await readFile(path.resolve(directory, "index.d.ts.map"), "utf8");

        validateSourceMap(sourcemap);
    });

    it("tsc", async () => {
        const directory = path.join(temporaryDirectory, "source-map-tsc");
        const bundle = await rollup({
            input,
            plugins: [
                dts({
                    emitDtsOnly: true,
                    oxc: false,
                    sourcemap: true,
                    tsconfig,
                }),
            ],
        });

        await bundle.write({ dir: directory, sourcemap: true });
        await expectFilesSnapshot(directory, "__snapshots__/source-map-tsc.md");
        const sourcemap = await readFile(path.resolve(directory, "index.d.ts.map"), "utf8");

        validateSourceMap(sourcemap);
    });

    it("tsgo", async () => {
        const directory = path.join(temporaryDirectory, "source-map-tsgo");
        const bundle = await rollup({
            input,
            plugins: [
                dts({
                    emitDtsOnly: true,
                    sourcemap: true,
                    tsconfig,
                    tsgo: true,
                }),
            ],
        });

        await bundle.write({ dir: directory, sourcemap: true });
        await expectFilesSnapshot(directory, "__snapshots__/source-map-tsgo.md");
        const sourcemap = await readFile(path.resolve(directory, "index.d.ts.map"), "utf8");

        validateSourceMap(sourcemap);
    });

    it("disable dts source map only", async () => {
        const { chunks } = await rolldownBuild(input, [dts({ sourcemap: false })], {}, { sourcemap: true });
        const fileNames = chunks.map((chunk) => chunk.fileName);

        expect(fileNames).toContain("index.d.ts");
        expect(fileNames).toContain("index.js");
        expect(fileNames).toContain("index.js.map");
        expect(fileNames).not.toContain("index.d.ts.map");
    });
});
