import { readFileSync } from "@visulima/fs";

import { resolve } from "../../../utils/resolve";

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
export type UrlResolve = (inputUrl: string, baseDirectories: string[]) => Promise<UrlFile>;

export const urlResolve: UrlResolve = async (inputUrl: string, baseDirectories: string[]): Promise<UrlFile> => {
    const urlObject = new URL(inputUrl, "file://");
    const fragmentIdentifier = urlObject.hash ? urlObject.hash.slice(1) : "";
    const url = inputUrl.split("?")[0] ?? "";

    const paths = [url];

    if (url.startsWith("/")) {
        paths.push(`.${url}`);
    }

    if (!url.startsWith("/") && !url.startsWith(".")) {
        paths.push(`./${url}`);
    }

    const from = resolve(paths, { baseDirs: baseDirectories, caller: "URL resolver" });
    const urlQuery = new URLSearchParams(urlObject.search).toString();

    return {
        from,
        source: readFileSync(from, { buffer: true }),
        urlQuery: (urlQuery ? `?${urlQuery}` : "") + (fragmentIdentifier ? `#${fragmentIdentifier}` : ""),
    };
};
