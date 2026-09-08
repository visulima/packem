import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

import { basename } from "@visulima/path";

import { createDebug } from "./debug";

const debug = createDebug();

/** Digest algorithms that can be emitted next to an executable. */
type ChecksumAlgorithm = "sha256" | "sha512";

/**
 * Streams a file through a hash function.
 *
 * Executables routinely run to hundreds of megabytes, so the file is streamed rather
 * than read into a single buffer.
 * @param filePath Absolute path of the file to digest.
 * @param algorithm The digest algorithm.
 * @returns The lowercase hex digest.
 */
const hashFile = async (filePath: string, algorithm: ChecksumAlgorithm): Promise<string> => {
    const hash = createHash(algorithm);

    await pipeline(createReadStream(filePath), hash);

    return hash.digest("hex");
};

/**
 * Writes a `&lt;file>.&lt;algorithm>` sidecar next to an executable.
 *
 * The file uses the `coreutils` format (`&lt;digest>  &lt;name>`) so it can be verified with
 * `sha256sum -c app.sha256` without any extra tooling.
 * @param filePath Absolute path of the executable to digest.
 * @param algorithm The digest algorithm.
 * @returns The digest and the path of the sidecar that was written.
 */
const writeChecksum = async (filePath: string, algorithm: ChecksumAlgorithm): Promise<{ digest: string; path: string }> => {
    const digest = await hashFile(filePath, algorithm);
    const checksumPath = `${filePath}.${algorithm}`;

    await writeFile(checksumPath, `${digest}  ${basename(filePath)}\n`);

    debug("Wrote %s checksum: %s", algorithm, checksumPath);

    return { digest, path: checksumPath };
};

/**
 * Normalizes the user-facing `exe.checksum` value.
 * @param checksum `true` for the default algorithm, an explicit algorithm, or a falsy value.
 * @returns The algorithm to use, or `undefined` when checksums are disabled.
 */
const resolveChecksumAlgorithm = (checksum: ChecksumAlgorithm | boolean | undefined): ChecksumAlgorithm | undefined => {
    if (!checksum) {
        return undefined;
    }

    return checksum === true ? "sha256" : checksum;
};

export type { ChecksumAlgorithm };
export { hashFile, resolveChecksumAlgorithm, writeChecksum };
