import { readdir, rm } from "node:fs/promises";

import { isAccessible, readJson } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";

const removeOldCacheFolders = async (cachePath: string | undefined, logger: Pail, logged: boolean): Promise<void> => {
    if (!cachePath) {
        return;
    }

    if (await isAccessible(join(cachePath, "keystore.json"))) {
        const keyStore: Record<string, string> = await readJson(join(cachePath, "keystore.json"));

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        let cacheDirectories = await readdir(cachePath, {
            withFileTypes: true,
        });

        cacheDirectories = cacheDirectories.filter((dirent) => dirent.isDirectory());

        let hasLogged = logged;

        for (const dirent of cacheDirectories) {
            if (!keyStore[dirent.name]) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    await rm(join(cachePath, dirent.name), {
                        force: true,
                        recursive: true,
                    });
                } catch (error) {
                    logger.error({
                        message: `Failed to remove cache directory ${dirent.name}: ${error instanceof Error ? error.message : String(error)}`,
                        prefix: "file-cache",
                    });

                    // eslint-disable-next-line no-continue
                    continue;
                }

                if (hasLogged) {
                    logger.raw("\n\n");
                }

                logger.info({
                    message: "Removing " + dirent.name + " file cache, the cache key is not used anymore.",
                    prefix: "file-cache",
                });

                hasLogged = false;
            }
        }
    }
};

export default removeOldCacheFolders;
