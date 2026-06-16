import { isAccessible } from "@visulima/fs";
import { isAbsolute, join } from "@visulima/path";

const PACKEM_CONFIG_FILES = [
    "packem.config.js",
    "packem.config.mjs",
    "packem.config.cjs",
    "packem.config.ts",
    "packem.config.cts",
    "packem.config.mts",
] as const;

const VALID_CONFIG_EXTENSION_REGEX = /\.(?:js|mjs|cjs|ts|cts|mts)$/;

const findPackemFile = async (rootDirectory: string, configPath = ""): Promise<string> => {
    // A config path explicitly provided by the user (`--config`) must be
    // validated and must exist — silently falling back to defaults hides typos.
    if (configPath) {
        const resolvedConfigPath = isAbsolute(configPath) ? configPath : join(rootDirectory, configPath);

        if (!VALID_CONFIG_EXTENSION_REGEX.test(resolvedConfigPath)) {
            throw new Error("Invalid packem config file extension. Only .js, .mjs, .cjs, .ts, .cts and .mts extensions are allowed.");
        }

        if (!await isAccessible(resolvedConfigPath)) {
            throw new Error(`The packem config file "${configPath}" could not be found at "${resolvedConfigPath}".`);
        }

        return resolvedConfigPath;
    }

    for (const file of PACKEM_CONFIG_FILES) {
        const candidate = join(rootDirectory, file);

        // eslint-disable-next-line no-await-in-loop
        if (await isAccessible(candidate)) {
            return candidate;
        }
    }

    throw new Error(`No packem config file found in "${rootDirectory}". Expected one of: ${PACKEM_CONFIG_FILES.join(", ")}.`);
};

const hasPackemConfig = async (rootDirectory: string): Promise<boolean> => {
    for (const file of PACKEM_CONFIG_FILES) {
        // eslint-disable-next-line no-await-in-loop
        if (await isAccessible(join(rootDirectory, file))) {
            return true;
        }
    }

    return false;
};

export { hasPackemConfig, PACKEM_CONFIG_FILES };
export default findPackemFile;
