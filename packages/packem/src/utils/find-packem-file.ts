import { isAccessible } from "@visulima/fs";
import { join } from "@visulima/path";

const findPackemFile = async (rootDirectory: string, configPath = ""): Promise<string> => {
    let packemConfigFilePath = configPath;

    if (!packemConfigFilePath) {
        const packemConfigFiles = ["packem.config.js", "packem.config.mjs", "packem.config.cjs", "packem.config.ts", "packem.config.cts", "packem.config.mts"];

        for await (const file of packemConfigFiles) {
            if (await isAccessible(join(rootDirectory, file))) {
                packemConfigFilePath = "./" + file;
                break;
            }
        }
    }

    if (!/\.(?:js|mjs|cjs|ts|cts|mts)$/.test(packemConfigFilePath)) {
        throw new Error("Invalid packem config file extension. Only .js, .mjs, .cjs, .ts, .cts and .mts extensions are allowed.");
    }

    return packemConfigFilePath;
};

export default findPackemFile;
