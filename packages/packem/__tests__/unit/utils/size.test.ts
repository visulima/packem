import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import brotliSize from "../../../src/packem/utils/brotli-size";
import gzipSize from "../../../src/packem/utils/gzip-size";

let tempFile: string;

beforeEach(async () => {
    tempFile = join(tmpdir(), `packem-size-test-${process.pid}.txt`);
    await writeFile(tempFile, "hello packem size helper test content");
});

afterEach(async () => {
    const { unlink } = await import("node:fs/promises");

    await unlink(tempFile).catch(() => {
        /* already removed */
    });
});

describe("gzipSize", () => {
    it("resolves to a positive number for a real file", async () => {
        expect.assertions(1);

        const size = await gzipSize(tempFile);

        expect(size).toBeGreaterThan(0);
    });

    it("rejects when the file does not exist (regression: read-stream error must not crash process)", async () => {
        expect.assertions(1);

        const missing = join(tmpdir(), `packem-does-not-exist-${process.pid}`);

        await expect(gzipSize(missing)).rejects.toThrow();
    });
});

describe("brotliSize", () => {
    it("resolves to a positive number for a real file", async () => {
        expect.assertions(1);

        const size = await brotliSize(tempFile);

        expect(size).toBeGreaterThan(0);
    });

    it("rejects when the file does not exist (regression: read-stream error must not crash process)", async () => {
        expect.assertions(1);

        const missing = join(tmpdir(), `packem-does-not-exist-brotli-${process.pid}`);

        await expect(brotliSize(missing)).rejects.toThrow();
    });
});
