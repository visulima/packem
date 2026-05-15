import { normalizePath } from "@rollup/pluginutils";
import { glob } from "tinyglobby";

const getFileNamesFromDirectory = async (directory: string): Promise<string[]> => {
    const files = await glob(["**/*.{,c,m}js", "**/*.{,c,m}d.ts"], {
        cwd: directory,
    });

    return files.toSorted((a, b) => a.localeCompare(b)).map((file) => normalizePath(file));
};

export default getFileNamesFromDirectory;
