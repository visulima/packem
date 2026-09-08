import { describe, expect, it } from "vitest";

import { selectEntryChunks } from "../../../src/exe/build";
import type { ExeChunk } from "../../../src/exe/options";

const chunks: ExeChunk[] = [
    { path: "cli.mjs", type: "entry" },
    { path: "worker.mjs", type: "entry" },
    { path: "shared/chunk-abc.mjs", type: "chunk" },
    { path: "cli.d.mts", type: "entry" },
    { path: "index.d.ts", type: "entry" },
];

describe(selectEntryChunks, () => {
    it("should keep every entry chunk when no filter is given", () => {
        expect.assertions(1);

        expect(selectEntryChunks(chunks, undefined).map((chunk) => chunk.path)).toStrictEqual(["cli.mjs", "worker.mjs"]);
    });

    it("should treat an empty filter as no filter", () => {
        expect.assertions(1);

        expect(selectEntryChunks(chunks, [])).toHaveLength(2);
    });

    it("should exclude declaration files, whatever their extension", () => {
        expect.assertions(1);

        const paths = selectEntryChunks(chunks, undefined).map((chunk) => chunk.path);

        expect(paths.some((path) => path.includes(".d."))).toBe(false);
    });

    it("should exclude non-entry chunks", () => {
        expect.assertions(1);

        expect(selectEntryChunks(chunks, undefined).map((chunk) => chunk.path)).not.toContain("shared/chunk-abc.mjs");
    });

    it("should match a filter entry by its base name", () => {
        expect.assertions(1);

        expect(selectEntryChunks(chunks, ["cli"]).map((chunk) => chunk.path)).toStrictEqual(["cli.mjs"]);
    });

    it("should match a filter entry by its file name", () => {
        expect.assertions(1);

        expect(selectEntryChunks(chunks, ["worker.mjs"]).map((chunk) => chunk.path)).toStrictEqual(["worker.mjs"]);
    });

    it("should match several entries at once", () => {
        expect.assertions(1);

        expect(selectEntryChunks(chunks, ["cli", "worker"])).toHaveLength(2);
    });

    it("should throw when no entry chunk was produced at all", () => {
        expect.assertions(1);

        expect(() => selectEntryChunks([{ path: "chunk.mjs", type: "chunk" }], undefined)).toThrow("requires a built entry");
    });

    it("should list the available entries when the filter matches nothing", () => {
        expect.assertions(2);

        expect(() => selectEntryChunks(chunks, ["nope"])).toThrow('The `exe.entries` filter ["nope"] matched none');
        expect(() => selectEntryChunks(chunks, ["nope"])).toThrow("- cli.mjs");
    });
});
