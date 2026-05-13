import { isAccessible } from "@visulima/fs";
import { join } from "@visulima/path";

export const PACKEM_CONFIG_FILES = [
    "packem.config.js",
    "packem.config.mjs",
    "packem.config.cjs",
    "packem.config.ts",
    "packem.config.cts",
    "packem.config.mts",
] as const;

const VALID_CONFIG_EXTENSION_REGEX = /\.(?:js|mjs|cjs|ts|cts|mts)$/;

const findPackemFile = async (rootDirectory: string, configPath = ""): Promise<string> => {
    let packemConfigFilePath = configPath;

    if (!packemConfigFilePath) {
        for (const file of PACKEM_CONFIG_FILES) {
            // eslint-disable-next-line no-await-in-loop
            if (await isAccessible(join(rootDirectory, file))) {
                packemConfigFilePath = `./${file}`;
                break;
            }
        }
    }

    if (!VALID_CONFIG_EXTENSION_REGEX.test(packemConfigFilePath)) {
        throw new Error("Invalid packem config file extension. Only .js, .mjs, .cjs, .ts, .cts and .mts extensions are allowed.");
    }

    return packemConfigFilePath;
};

export const hasPackemConfig = async (rootDirectory: string): Promise<boolean> => {
    for (const file of PACKEM_CONFIG_FILES) {
        // eslint-disable-next-line no-await-in-loop
        if (await isAccessible(join(rootDirectory, file))) {
            return true;
        }
    }

    return false;
};

export default findPackemFile;
