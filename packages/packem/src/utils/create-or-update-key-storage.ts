import { isAccessibleSync, readJsonSync, writeJsonSync } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import { join } from "@visulima/path";

const createOrUpdateKeyStorage = (hashKey: string, storePath: string, logger: Pail, shouldUpdate?: true): void => {
    try {
        let keyStore: Record<string, string> = {};

        const keyStorePath = join(storePath, "keystore.json");

        if (shouldUpdate && isAccessibleSync(keyStorePath)) {
            keyStore = readJsonSync(keyStorePath);
        }

        if (keyStore[hashKey] === undefined) {
            keyStore[hashKey] = new Date().toISOString();
        }

        writeJsonSync(keyStorePath, keyStore, {
            overwrite: true,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.debug({
            context: [error],
            message: error.message,
            prefix: "cache-key-store",
        });
    }
};

export default createOrUpdateKeyStorage;
