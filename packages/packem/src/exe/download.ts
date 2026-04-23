/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Buffer } from "node:buffer";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";

import { isAccessible } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { dirname, join } from "@visulima/path";
import { x } from "tinyexec";

import { getCachedBinaryPath } from "./cache";
import { createDebug } from "./debug";
import type { ExeTarget } from "./platform";
import {
    getArchiveExtension,
    getBinaryPathInArchive,
    getDownloadUrl,
    resolveNodeVersion,
} from "./platform";

const debug = createDebug();

const extractBinary = async (
    archivePath: string,
    targetBinaryPath: string,
    target: ExeTarget,
): Promise<void> => {
    const binaryInArchive = getBinaryPathInArchive(target);
    const outDirectory = dirname(targetBinaryPath);

    debug("Extracting %s from archive to %s", binaryInArchive, outDirectory);

    if (target.platform === "win") {
        await x(
            "tar",
            ["-xf", archivePath, "-C", outDirectory, "--strip-components=1", binaryInArchive],
            { nodeOptions: { stdio: "inherit" }, throwOnError: true },
        );
    } else {
        const decompressFlag = archivePath.endsWith(".tar.xz") ? "J" : "z";

        await x(
            "tar",
            [`-x${decompressFlag}f`, archivePath, "-C", outDirectory, "--strip-components=2", binaryInArchive],
            { nodeOptions: { stdio: "inherit" }, throwOnError: true },
        );
    }

    const extractedName = target.platform === "win" ? "node.exe" : "node";
    const extractedPath = join(outDirectory, extractedName);

    if (extractedPath !== targetBinaryPath) {
        await rename(extractedPath, targetBinaryPath);
    }
};

// eslint-disable-next-line import/prefer-default-export
export const resolveNodeBinary = async (
    target: ExeTarget,
    logger: Pail,
): Promise<string> => {
    debug("Resolving Node.js binary for target: %O", target);

    const resolvedTarget: ExeTarget = {
        ...target,
        nodeVersion: await resolveNodeVersion(target.nodeVersion),
    };
    const cachedPath = getCachedBinaryPath(resolvedTarget);

    debug("Cache path: %s", cachedPath);

    if (await isAccessible(cachedPath)) {
        debug("Cache hit: %s", cachedPath);
        logger.info(
            `Using cached Node.js ${resolvedTarget.nodeVersion} for ${resolvedTarget.platform}-${resolvedTarget.arch}`,
        );

        return cachedPath;
    }

    const url = getDownloadUrl(resolvedTarget);

    debug("Cache miss, downloading from: %s", url);
    logger.info(
        `Downloading Node.js ${resolvedTarget.nodeVersion} for ${resolvedTarget.platform}-${resolvedTarget.arch}...`,
    );
    logger.info(`  ${url}`);

    await mkdir(dirname(cachedPath), { recursive: true });

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Failed to download Node.js binary: HTTP ${String(response.status)} from ${url}`,
        );
    }

    const extension = getArchiveExtension(resolvedTarget.platform);
    const archivePath = `${cachedPath}.download.${extension}`;
    const buffer = Buffer.from(await response.arrayBuffer());

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
