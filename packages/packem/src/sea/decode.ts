import { Buffer } from "node:buffer";
import { promisify } from "node:util";
// `exe` builds require Node.js >= 25.7, where zstd is stable. The rule checks the package's
// own engines range, which is wider than the runtimes this module actually runs on.
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- see above
import { brotliDecompress, gunzip, zstdDecompress } from "node:zlib";

/** Algorithms packem can apply to an embedded payload. Mirrors `exe.compress`. */
type SeaCompression = "brotli" | "gzip" | "zstd";

/** The manifest packem embeds next to the assets when the payload is encoded. */
interface SeaManifest {
    /** Absent when assets are embedded verbatim. */
    compression?: SeaCompression;
}

const DECOMPRESSORS = {
    brotli: promisify(brotliDecompress),
    gzip: promisify(gunzip),
    zstd: promisify(zstdDecompress),
} satisfies Record<SeaCompression, unknown>;

/**
 * Reverses the compression packem applied to an embedded asset.
 * @param data The bytes exactly as they were embedded.
 * @param compression The algorithm recorded in the manifest, or `undefined` when the asset is stored verbatim.
 * @returns The original bytes. The input is returned untouched when nothing was applied.
 * @throws If the bytes are not a valid stream for the named algorithm.
 */
const decodeAsset = async (data: ArrayBuffer, compression: SeaCompression | undefined): Promise<ArrayBuffer> => {
    if (compression === undefined) {
        return data;
    }

    const output = await DECOMPRESSORS[compression](Buffer.from(data));

    return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
};

export type { SeaCompression, SeaManifest };
export { decodeAsset };
