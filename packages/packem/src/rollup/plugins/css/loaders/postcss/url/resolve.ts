import { readFile } from "@visulima/fs";

import { resolve as utilResolve } from "../../../utils/resolve";

/** File resolved by URL resolver */
export interface UrlFile {
    /** Absolute path to file */
    from: string;
    /** File source */
    source: Uint8Array;
    /** Original query extracted from the input path */
    urlQuery?: string;
}

/** URL resolver */
export type UrlResolve = (inputUrl: string, basedir: string) => Promise<UrlFile>;

export const urlResolve: UrlResolve = async (inputUrl: string, basedir: string): Promise<UrlFile> => {
    const options = { basedirs: [basedir], caller: "URL resolver" };

    const urlObject = new URL(inputUrl, "file://");
    const fragmentIdentifier = urlObject.hash ? urlObject.hash.slice(1) : "";
    const query = Object.fromEntries(new URLSearchParams(urlObject.search));
    const url = urlObject.pathname;

    const from = utilResolve([url, `./${url}`], options);
    const urlQuery = new URLSearchParams({ ...query, fragmentIdentifier }).toString();

    return { from, source: await readFile(from, { buffer: true }), urlQuery };
};
