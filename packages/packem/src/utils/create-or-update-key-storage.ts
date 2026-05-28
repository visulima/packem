import { isAccessibleSync, readJsonSync, writeJsonSync } from "@visulima/fs";
import { join } from "@visulima/path";

interface LoggerMessage {
    context?: unknown[];
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
    debug: (message: LoggerMessage | string, ...arguments_: unknown[]) => void;
}

const createOrUpdateKeyStorage = (hashKey: string, storePath: string, logger: Logger, shouldUpdate?: true): void => {
    try {
        let keyStore: Record<string, string> = {};

        const keyStorePath = join(storePath, "keystore.json");

        if (shouldUpdate && isAccessibleSync(keyStorePath)) {
            keyStore = readJsonSync(keyStorePath) as Record<string, string>;
        }

        if (!Object.hasOwn(keyStore, hashKey)) {
            keyStore[hashKey] = new Date().toISOString();
        }

        writeJsonSync(keyStorePath, keyStore, {
            overwrite: true,
        });
    } catch (error) {
        logger.debug({
            context: [error],
            message: error instanceof Error ? error.message : String(error),
            prefix: "cache-key-store",
        });
    }
};

export default createOrUpdateKeyStorage;
