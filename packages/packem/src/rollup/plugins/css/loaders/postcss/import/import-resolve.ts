import { isRelative } from "@visulima/path/utils";
import type { Node } from "postcss";

import { resolve } from "../../../utils/resolve";

/** `@import` resolver */
export type ImportResolve = (url: string, basedir: string, extensions: string[], atRule: Node) => string | Promise<string>;

export const importResolve: ImportResolve = (inputUrl: string, basedir: string, extensions: string[]): string => {
    const options = { baseDirs: [basedir], caller: "@import resolver", extensions };
    const urlObject = new URL(inputUrl, "file://");
    const url = urlObject.pathname;

    const paths = [url];

    if (isRelative(url) || url.startsWith("/")) {
        paths.push("." + url);
    }

    if (url.startsWith("/")) {
        paths.push(url.slice(1));
    }

    return resolve(paths, options);
};
