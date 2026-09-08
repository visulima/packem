import type { Buffer } from "node:buffer";
import { promisify } from "node:util";
// `exe` builds already require Node.js >= 25.7, where zstd is stable. The rule checks the
// package's own engines range (>= 22), which is wider than this module's reachable callers.
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- see above
import { brotliCompress, constants as zlibConstants, gzip, zstdCompress } from "node:zlib";

/**
 * Algorithms available for shrinking the payload embedded in an executable.
 *
 * All three ship with Node.js, so a compressed executable needs no extra dependency at
 * build time or at runtime.
 */
type CompressionAlgorithm = "brotli" | "gzip" | "zstd";

/** Asset key holding the JSON manifest that tells the runtime how assets were encoded. */
const MANIFEST_ASSET_KEY = "__packem_sea_manifest__";

/** Asset key holding the V8 code cache when `exe.bytecode` is enabled. */
const BYTECODE_ASSET_KEY = "__packem_sea_bytecode__";

interface SeaManifest {
    /** Absent when assets are embedded verbatim. */
    compression?: CompressionAlgorithm;
}

const ALGORITHMS = new Set(["brotli", "gzip", "zstd"]);

const brotliCompressAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const zstdCompressAsync = promisify(zstdCompress);

/**
 * Compresses a buffer with the requested algorithm, tuned for size over speed.
 *
 * Build time is paid once; the size is paid by every user who downloads the executable,
 * so each algorithm runs at its maximum level.
 * @param input The bytes to compress.
 * @param algorithm The algorithm to use.
 * @returns The compressed bytes.
 */
const compressBuffer = async (input: Buffer, algorithm: CompressionAlgorithm): Promise<Buffer> => {
    if (algorithm === "gzip") {
        return await gzipAsync(input, { level: zlibConstants.Z_BEST_COMPRESSION });
    }

    if (algorithm === "zstd") {
        return await zstdCompressAsync(input);
    }

    return await brotliCompressAsync(input, {
        params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: input.length,
        },
    });
};

/**
 * Normalizes the user-facing `exe.compress` value.
 * @param compress An algorithm name, `true` for the default, or a falsy value to disable.
 * @returns The resolved algorithm, or `undefined` when the payload stays uncompressed.
 * @throws If the value names an algorithm that does not exist.
 */
const resolveCompression = (compress: boolean | string | undefined): CompressionAlgorithm | undefined => {
    if (!compress) {
        return undefined;
    }

    if (compress === true) {
        return "brotli";
    }

    // Widened deliberately: the value reaches us from JavaScript config files and CLI flags,
    // where the type is not enforced.
    if (!ALGORITHMS.has(compress)) {
        throw new Error(`Unknown \`exe.compress\` algorithm "${compress}". Supported algorithms: brotli, gzip, zstd.`);
    }

    return compress as CompressionAlgorithm;
};

export type { CompressionAlgorithm, SeaManifest };
export { BYTECODE_ASSET_KEY, compressBuffer, MANIFEST_ASSET_KEY, resolveCompression };
