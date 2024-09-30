import { isAbsolute, parse, toNamespacedPath } from "@visulima/path";

import { isRelativePath } from "./path";

export const isModule = (url: string): boolean => /^~[\d@A-Z]/i.test(url);

export const getUrlOfPartial = (url: string): string => {
    const { base, dir } = parse(url);

    return dir ? `${toNamespacedPath(dir)}/_${base}` : `_${base}`;
};

export const normalizeUrl = (url: string): string => {
    if (isModule(url)) {
        return toNamespacedPath(url.slice(1));
    }

    if (isAbsolute(url) || isRelativePath(url)) {
        return toNamespacedPath(url);
    }

    return `./${toNamespacedPath(url)}`;
};
