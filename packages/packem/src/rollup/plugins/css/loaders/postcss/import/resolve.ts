import { readFile } from "@visulima/fs";
import { isRelative } from "@visulima/path/utils";

import { resolve } from "../../../utils/resolve";

/** File resolved by `@import` resolver */
interface ImportFile {
    /** Absolute path to file */
    from: string;
    /** File source */
    source: Uint8Array;
}

/** `@import` resolver */
export type ImportResolve = (url: string, basedir: string, extensions: string[]) => Promise<ImportFile>;

export const importResolve: ImportResolve = async (inputUrl: string, basedir: string, extensions: string[]): Promise<ImportFile> => {
    const options = { basedirs: [basedir], caller: "@import resolver", extensions };
    const urlObject = new URL(inputUrl, "file://");
    const url = urlObject.pathname;

    const paths = [url];

    if (isRelative(url)) {
        paths.push("." + url);
    }

    if (url.startsWith("/")) {
        paths.push(url.slice(1));
    }

    const from = resolve(paths, options);

    return { from, source: await readFile(from, { buffer: true }) };
};
