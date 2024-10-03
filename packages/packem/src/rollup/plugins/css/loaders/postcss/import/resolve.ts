import { readFile } from "@visulima/fs";

import { resolveAsync } from "../../../utils/resolve";

/** File resolved by `@import` resolver */
interface ImportFile {
    /** Absolute path to file */
    from: string;
    /** File source */
    source: Uint8Array;
}

/** `@import` resolver */
export type ImportResolve = (url: string, basedir: string, extensions: string[]) => Promise<ImportFile>;

export const resolve: ImportResolve = async (inputUrl, basedir, extensions): Promise<ImportFile> => {
    const options = { basedirs: [basedir], caller: "@import resolver", extensions };

    const urlObject = new URL(inputUrl, "file://");
    const url = urlObject.pathname;

    const from = await resolveAsync([url, `./${url}`], options);

    return { from, source: await readFile(from, { buffer: true }) };
};
