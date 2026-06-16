import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";

import { isAccessible } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { basename, dirname, join } from "@visulima/path";
import { x } from "tinyexec";

import { getCachedBinaryPath } from "./cache";
import { createDebug } from "./debug";
import type { ExeTarget } from "./platform";
import { getArchiveExtension, getBinaryPathInArchive, getDownloadUrl, resolveNodeVersion } from "./platform";

const debug = createDebug();

// Splits a SHASUMS256.txt line on its run of whitespace separating hash and name.
const WHITESPACE_REGEX = /\s+/;

/**
 * Fetches `SHASUMS256.txt` for the given Node.js version and returns the
 * expected sha256 hex digest for the named archive file.
 * @param nodeVersion Resolved Node.js version (without the leading `v`).
 * @param archiveFileName The archive's basename, e.g. `node-v25.7.0-linux-x64.tar.xz`.
 * @returns The lowercase hex sha256 digest expected for the archive.
 * @throws If the SHASUMS file can't be fetched or has no entry for the archive.
 */
const fetchExpectedChecksum = async (nodeVersion: string, archiveFileName: string): Promise<string> => {
    const shasumsUrl = `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`;

    debug("Fetching checksums from: %s", shasumsUrl);

    const response = await fetch(shasumsUrl);

    if (!response.ok) {
        throw new Error(`Failed to download Node.js checksums: HTTP ${String(response.status)} from ${shasumsUrl}`);
    }

    const shasums = await response.text();

    // Each line is `<sha256>  <filename>` (two spaces).
    for (const line of shasums.split("\n")) {
        const [hash, name] = line.trim().split(WHITESPACE_REGEX);

        if (name === archiveFileName && hash) {
            return hash.toLowerCase();
        }
    }

    throw new Error(`No checksum entry for "${archiveFileName}" found in ${shasumsUrl}.`);
};

const extractBinary = async (archivePath: string, targetBinaryPath: string, target: ExeTarget): Promise<void> => {
    const binaryInArchive = getBinaryPathInArchive(target);
    const outDirectory = dirname(targetBinaryPath);

    debug("Extracting %s from archive to %s", binaryInArchive, outDirectory);

    if (target.platform === "win") {
        await x("tar", ["-xf", archivePath, "-C", outDirectory, "--strip-components=1", binaryInArchive], {
            nodeOptions: { stdio: "inherit" },
            throwOnError: true,
        });
    } else {
        const decompressFlag = archivePath.endsWith(".tar.xz") ? "J" : "z";

        await x("tar", [`-x${decompressFlag}f`, archivePath, "-C", outDirectory, "--strip-components=2", binaryInArchive], {
            nodeOptions: { stdio: "inherit" },
            throwOnError: true,
        });
    }

    const extractedName = target.platform === "win" ? "node.exe" : "node";
    const extractedPath = join(outDirectory, extractedName);

    if (extractedPath !== targetBinaryPath) {
        await rename(extractedPath, targetBinaryPath);
    }
};

// eslint-disable-next-line import/prefer-default-export
export const resolveNodeBinary = async (target: ExeTarget, logger: Pail): Promise<string> => {
    debug("Resolving Node.js binary for target: %O", target);

    const resolvedTarget: ExeTarget = {
        ...target,
        nodeVersion: await resolveNodeVersion(target.nodeVersion),
    };
    const cachedPath = getCachedBinaryPath(resolvedTarget);

    debug("Cache path: %s", cachedPath);

    if (await isAccessible(cachedPath)) {
        debug("Cache hit: %s", cachedPath);
        logger.info(`Using cached Node.js ${resolvedTarget.nodeVersion} for ${resolvedTarget.platform}-${resolvedTarget.arch}`);

        return cachedPath;
    }

    const url = getDownloadUrl(resolvedTarget);

    debug("Cache miss, downloading from: %s", url);
    logger.info(`Downloading Node.js ${resolvedTarget.nodeVersion} for ${resolvedTarget.platform}-${resolvedTarget.arch}...`);
    logger.info(`  ${url}`);

    await mkdir(dirname(cachedPath), { recursive: true });

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download Node.js binary: HTTP ${String(response.status)} from ${url}`);
    }

    const extension = getArchiveExtension(resolvedTarget.platform);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Verify integrity against the official SHASUMS256.txt before trusting the
    // bytes — these get embedded into user executables and cached.
    const archiveFileName = basename(url);
    const expectedChecksum = await fetchExpectedChecksum(resolvedTarget.nodeVersion, archiveFileName);
    const actualChecksum = createHash("sha256").update(buffer).digest("hex");

    if (actualChecksum !== expectedChecksum) {
        throw new Error(
            `Checksum mismatch for ${archiveFileName}: expected ${expectedChecksum}, got ${actualChecksum}. The download may be corrupted or tampered with.`,
        );
    }

    debug("Checksum verified for %s", archiveFileName);

    // Use a unique temp filename + atomic-style rename so concurrent processes
    // downloading the same binary don't clobber each other's partial writes.
    const archivePath = `${cachedPath}.download.${randomUUID()}.${extension}`;

    debug("Downloaded %d bytes, writing to: %s", buffer.length, archivePath);
    await writeFile(archivePath, buffer);

    try {
        await extractBinary(archivePath, cachedPath, resolvedTarget);

        if (resolvedTarget.platform !== "win") {
            await chmod(cachedPath, 0o755);
        }

        debug("Binary cached at: %s", cachedPath);
        logger.info(`Cached Node.js binary at: ${cachedPath}`);
    } finally {
        await rm(archivePath, { force: true });
    }

    return cachedPath;
};
