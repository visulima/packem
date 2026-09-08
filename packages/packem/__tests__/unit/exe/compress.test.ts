import { Buffer } from "node:buffer";
import { promisify } from "node:util";
// `exe` builds require Node.js >= 25.7, where zstd is stable; the rule checks the wider
// engines range declared by the package.
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- see above
import { brotliDecompress, gunzip, zstdDecompress } from "node:zlib";

import { describe, expect, it } from "vitest";

import type { CompressionAlgorithm } from "../../../src/exe/compress";
import { BYTECODE_ASSET_KEY, compressBuffer, MANIFEST_ASSET_KEY, resolveCompression } from "../../../src/exe/compress";

const DECOMPRESSORS = {
    brotli: promisify(brotliDecompress),
    gzip: promisify(gunzip),
    zstd: promisify(zstdDecompress),
} satisfies Record<CompressionAlgorithm, unknown>;

describe("exe compression", () => {
    describe(resolveCompression, () => {
        it.each([[undefined], [false]])("should return undefined for %s", (value) => {
            expect.assertions(1);

            expect(resolveCompression(value)).toBeUndefined();
        });

        it("should default `true` to brotli", () => {
            expect.assertions(1);

            expect(resolveCompression(true)).toBe("brotli");
        });

        it.each([["brotli"], ["gzip"], ["zstd"]] as const)("should pass %s through", (algorithm) => {
            expect.assertions(1);

            expect(resolveCompression(algorithm)).toBe(algorithm);
        });

        it("should reject an unknown algorithm", () => {
            expect.assertions(1);

            expect(() => resolveCompression("lzma")).toThrow('Unknown `exe.compress` algorithm "lzma"');
        });
    });

    describe(compressBuffer, () => {
        // Highly compressible on purpose, so the size assertion is not flaky.
        const payload = Buffer.from("packem".repeat(4096));

        it.each([["brotli"], ["gzip"], ["zstd"]] as const)("should round-trip through %s", async (algorithm) => {
            expect.assertions(1);

            const compressed = await compressBuffer(payload, algorithm);
            const restored = await DECOMPRESSORS[algorithm](compressed);

            expect(Buffer.from(restored as Uint8Array).equals(payload)).toBe(true);
        });

        it.each([["brotli"], ["gzip"], ["zstd"]] as const)("should actually shrink the payload with %s", async (algorithm) => {
            expect.assertions(1);

            const compressed = await compressBuffer(payload, algorithm);

            expect(compressed.length).toBeLessThan(payload.length);
        });

        it("should round-trip an empty buffer", async () => {
            expect.assertions(1);

            const compressed = await compressBuffer(Buffer.alloc(0), "brotli");
            const restored = await DECOMPRESSORS.brotli(compressed);

            expect(Buffer.from(restored as Uint8Array)).toHaveLength(0);
        });

        it("should round-trip bytes that are not valid UTF-8", async () => {
            expect.assertions(1);

            const binary = Buffer.from([0, 255, 128, 13, 10, 254, 1]);
            const compressed = await compressBuffer(binary, "zstd");
            const restored = await DECOMPRESSORS.zstd(compressed);

            expect(Buffer.from(restored as Uint8Array).equals(binary)).toBe(true);
        });
    });

    describe("reserved asset keys", () => {
        it("should namespace the internal keys so they cannot collide with a user asset", () => {
            expect.assertions(2);

            expect(MANIFEST_ASSET_KEY).toBe("__packem_sea_manifest__");
            expect(BYTECODE_ASSET_KEY).toBe("__packem_sea_bytecode__");
        });
    });
});
