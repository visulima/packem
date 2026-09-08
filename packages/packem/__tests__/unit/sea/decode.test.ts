import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import type { CompressionAlgorithm } from "../../../src/exe/compress";
import { compressBuffer } from "../../../src/exe/compress";
import { decodeAsset } from "../../../src/sea/decode";

const ALGORITHMS: CompressionAlgorithm[] = ["brotli", "gzip", "zstd"];

const toArrayBuffer = (buffer: Buffer): ArrayBuffer => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

describe(decodeAsset, () => {
    it("should return the bytes untouched when nothing was applied", async () => {
        expect.assertions(1);

        const data = toArrayBuffer(Buffer.from("verbatim"));

        await expect(decodeAsset(data, undefined)).resolves.toBe(data);
    });

    // The build side and the runtime side have to agree on every algorithm; this pairs the
    // real compressor with the real decompressor rather than asserting on either alone.
    it.each(ALGORITHMS)("should decode what the build compressed with %s", async (algorithm) => {
        expect.assertions(1);

        const original = Buffer.from("<h1>{{title}}</h1>\n".repeat(200));
        const compressed = await compressBuffer(original, algorithm);
        const decoded = await decodeAsset(toArrayBuffer(compressed), algorithm);

        expect(Buffer.from(decoded).equals(original)).toBe(true);
    });

    it.each(ALGORITHMS)("should decode binary content with %s", async (algorithm) => {
        expect.assertions(1);

        const original = Buffer.from([0, 255, 128, 13, 10, 254, 1, 0, 0, 7]);
        const compressed = await compressBuffer(original, algorithm);
        const decoded = await decodeAsset(toArrayBuffer(compressed), algorithm);

        expect(Buffer.from(decoded).equals(original)).toBe(true);
    });

    it.each(ALGORITHMS)("should decode an empty asset with %s", async (algorithm) => {
        expect.assertions(1);

        const compressed = await compressBuffer(Buffer.alloc(0), algorithm);
        const decoded = await decodeAsset(toArrayBuffer(compressed), algorithm);

        expect(decoded.byteLength).toBe(0);
    });

    it("should preserve multi-byte characters through a round trip", async () => {
        expect.assertions(1);

        const original = Buffer.from("héllo 🎯 世界", "utf8");
        const compressed = await compressBuffer(original, "brotli");
        const decoded = await decodeAsset(toArrayBuffer(compressed), "brotli");

        expect(Buffer.from(decoded).toString("utf8")).toBe("héllo 🎯 世界");
    });

    it("should reject bytes that are not a valid stream for the named algorithm", async () => {
        expect.assertions(1);

        const notGzip = toArrayBuffer(Buffer.from("this is not a gzip stream"));

        await expect(decodeAsset(notGzip, "gzip")).rejects.toThrow();
    });

    it("should reject when the manifest names a different algorithm than was used", async () => {
        expect.assertions(1);

        const compressed = await compressBuffer(Buffer.from("packem".repeat(100)), "gzip");

        await expect(decodeAsset(toArrayBuffer(compressed), "zstd")).rejects.toThrow();
    });
});
