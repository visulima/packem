import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { rollupBuild } from "@sxzz/test-utils";
import { describe, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(dirname, "fixtures/augmentation-retention");
const namingFixtures = path.resolve(dirname, "fixtures/chunk-name-collision");

// Rollup only tree-shakes when `treeshake` is enabled, and the shared helper turns it off.
const TREESHAKE = { treeshake: true };

const CROSS_CHUNK_PLACEHOLDER = "__rollup_dts_resolve__";
const EXPORT_BRACE_RE = /export\s*\{/u;
const DECLARE_INDEX_RE = /declare module "\.\/index\.js"/u;

const codeOf = (chunks: { code?: string; source?: unknown; type: string }[]): string =>
    chunks.map((chunk) => (chunk.type === "chunk" ? chunk.code : String(chunk.source))).join("\n");

describe("module augmentation retention", () => {
    it("keeps an augmentation-only module imported for its side effect", async () => {
        expect.assertions(2);

        const { chunks } = await rollupBuild(path.resolve(fixtures, "index.ts"), [dts({ emitDtsOnly: true })], TREESHAKE);
        const code = codeOf(chunks);

        expect(code).toContain("interface Base");
        expect(code).toContain("extra: number");
    });

    it("keeps declare global augmentations", async () => {
        expect.assertions(1);

        const { chunks } = await rollupBuild(path.resolve(fixtures, "index.ts"), [dts({ emitDtsOnly: true })], TREESHAKE);

        expect(codeOf(chunks)).toContain("appVersion: string");
    });

    it("keeps a declare module block in a re-exported module, pointing at the entry chunk", async () => {
        expect.assertions(3);

        const { chunks } = await rollupBuild(path.resolve(fixtures, "index.ts"), [dts({ emitDtsOnly: true })], TREESHAKE);
        const code = codeOf(chunks);

        expect(code).toContain("label: string");
        expect(code).toMatch(DECLARE_INDEX_RE);
        expect(code).not.toContain(CROSS_CHUNK_PLACEHOLDER);
    });

    it("resolves relative augmentation targets when the entry is reached through a symlink", async () => {
        expect.assertions(2);

        const linkRoot = mkdtempSync(path.join(tmpdir(), "dts-augmentation-"));

        try {
            symlinkSync(fixtures, path.join(linkRoot, "linked"), "dir");

            const { chunks } = await rollupBuild(path.join(linkRoot, "linked", "index.ts"), [dts({ emitDtsOnly: true })], TREESHAKE);
            const code = codeOf(chunks);

            expect(code).toMatch(DECLARE_INDEX_RE);
            expect(code).not.toContain(CROSS_CHUNK_PLACEHOLDER);
        } finally {
            rmSync(linkRoot, { force: true, recursive: true });
        }
    });

    it("keeps the shared augmentation chunk a module when two entries import it", async () => {
        expect.assertions(2);

        const { chunks } = await rollupBuild(
            { "entry-b": path.resolve(fixtures, "entry-b.ts"), index: path.resolve(fixtures, "index.ts") },
            [dts({ emitDtsOnly: true })],
            TREESHAKE,
        );
        const augmentChunk = chunks.find((chunk) => chunk.type === "chunk" && chunk.code.includes("extra: number"));

        expect(augmentChunk).toBeDefined();
        expect(augmentChunk?.type === "chunk" && augmentChunk.code).toMatch(EXPORT_BRACE_RE);
    });

    it("keeps augmentations when the bundle treats modules as side-effect free", async () => {
        expect.assertions(2);

        const { chunks } = await rollupBuild(path.resolve(fixtures, "index.ts"), [dts({ emitDtsOnly: true })], {
            treeshake: { moduleSideEffects: false },
        });
        const code = codeOf(chunks);

        expect(code).toContain("extra: number");
        expect(code).toContain("appVersion: string");
    });

    it("keeps augmentations of a dtsInput declaration file", async () => {
        expect.assertions(1);

        const { chunks } = await rollupBuild(path.resolve(fixtures, "dts-input/index.d.ts"), [dts({ dtsInput: true, emitDtsOnly: true })], TREESHAKE);

        expect(codeOf(chunks)).toContain("dtsAppVersion: string");
    });

    it("still drops a declarations-only module imported for its side effect by default", async () => {
        expect.assertions(1);

        const { chunks } = await rollupBuild(path.resolve(fixtures, "index.ts"), [dts({ emitDtsOnly: true })], TREESHAKE);

        expect(codeOf(chunks)).not.toContain("plainUnused");
    });
});

describe("chunk file names with a shared chunk named like an entry", () => {
    it("keeps entry names when chunk names carry a hash", async () => {
        expect.assertions(2);

        const { chunks } = await rollupBuild(
            { index: path.resolve(namingFixtures, "index.ts"), index2: path.resolve(namingFixtures, "index2.ts") },
            [dts({ emitDtsOnly: true })],
            {},
            { chunkFileNames: "[name]-[hash].js", entryFileNames: "[name].js" },
        );
        const fileNames = chunks.map((chunk) => chunk.fileName);

        expect(fileNames).toContain("index.d.ts");
        expect(fileNames).toContain("index2.d.ts");
    });

    it.each([
        ["array inputs", [path.resolve(namingFixtures, "index.ts"), path.resolve(namingFixtures, "index2.ts")]],
        ["aliased inputs", { index: path.resolve(namingFixtures, "index.ts"), index2: path.resolve(namingFixtures, "index2.ts") }],
    ])("names the shared chunk apart from the entry without a hash (%s)", async (_name, input) => {
        expect.assertions(4);

        const { chunks } = await rollupBuild(input, [dts({ emitDtsOnly: true })], {}, { chunkFileNames: "[name].js", entryFileNames: "[name].js" });
        const fileNames = chunks.map((chunk) => chunk.fileName);

        expect(fileNames).toContain("index.d.ts");
        expect(fileNames).toContain("index2.d.ts");
        expect(fileNames).toContain("index2-shared.d.ts");
        expect(fileNames).not.toContain("index22.d.ts");
    });

    it("keeps entry names with dtsInput", async () => {
        expect.assertions(2);

        const { chunks } = await rollupBuild(
            { index: path.resolve(namingFixtures, "dts/index.d.ts"), index2: path.resolve(namingFixtures, "dts/index2.d.ts") },
            [dts({ dtsInput: true, emitDtsOnly: true })],
            {},
            { chunkFileNames: "[name].js", entryFileNames: "[name].js" },
        );
        const fileNames = chunks.map((chunk) => chunk.fileName);

        expect(fileNames).toContain("index.d.ts");
        expect(fileNames).toContain("index2.d.ts");
    });
});
