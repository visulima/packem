import { readdir, rm } from "node:fs/promises";

import { isAccessible, readJson } from "@visulima/fs";
import { join } from "@visulima/path";

interface LoggerMessage {
    message: unknown;
    prefix?: string;
}

/**
 * Minimal, precisely-typed view of the `@visulima/pail` logger surface used here.
 *
 * The published `@visulima/pail` types re-export `Pail` from a non-existent
 * `./pail.d.ts`, so the upstream `Pail` type resolves to an unresolved/`any`-like
 * type. Modelling only the methods we call keeps the call sites strictly typed
 * without an `any` escape.
 * @internal
 */
interface Logger {
    error: (message: LoggerMessage | string, ...arguments_: unknown[]) => void;
    info: (message: LoggerMessage | string, ...arguments_: unknown[]) => void;
    raw: (message: string, ...arguments_: unknown[]) => void;
}

/**
 * Removes a single stale cache directory and logs the outcome.
 * @returns `true` when a removal message was emitted (so the caller can stop padding output).
 */
const removeStaleCacheDirectory = async (cachePath: string, name: string, logger: Logger, hasLogged: boolean): Promise<boolean> => {
    try {
        await rm(join(cachePath, name), {
            force: true,
            recursive: true,
        });
    } catch (error) {
        logger.error({
            message: `Failed to remove cache directory ${name}: ${error instanceof Error ? error.message : String(error)}`,
            prefix: "file-cache",
        });

        return hasLogged;
    }

    if (hasLogged) {
        logger.raw("\n");
    }

    logger.info({
        message: `Removing ${name} file cache, the cache key is not used anymore.`,
        prefix: "file-cache",
    });

    return false;
};

const removeOldCacheFolders = async (cachePath: string | undefined, logger: Logger, logged: boolean): Promise<void> => {
    if (!cachePath) {
        return;
    }

    const keyStorePath = join(cachePath, "keystore.json");
    const isKeyStoreAccessible = await isAccessible(keyStorePath);

    if (!isKeyStoreAccessible) {
        return;
    }

    const keyStore = await readJson<Record<string, string>>(keyStorePath);

    const allEntries = await readdir(cachePath, {
        withFileTypes: true,
    });

    const cacheDirectories = allEntries.filter((dirent) => dirent.isDirectory());

    let hasLogged = logged;

    for (const dirent of cacheDirectories) {
        if (!keyStore[dirent.name]) {
            // eslint-disable-next-line no-await-in-loop
            hasLogged = await removeStaleCacheDirectory(cachePath, dirent.name, logger, hasLogged);
        }
    }
};

export default removeOldCacheFolders;
