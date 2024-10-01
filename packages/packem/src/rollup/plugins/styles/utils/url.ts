import { isAbsolute, parse, toNamespacedPath } from "@visulima/path";

import { isRelativePath } from "./path";

export const hasModuleSpecifier = (url: string): boolean => /^~[\d@A-Za-z]/.test(url);

export const getUrlOfPartial = (url: string): string => {
    const { base, dir } = parse(url);

    return dir ? `${toNamespacedPath(dir)}/_${base}` : `_${base}`;
};

export const normalizeUrl = (url: string): string => {
    if (hasModuleSpecifier(url)) {
        return toNamespacedPath(url.slice(1));
    }

    if (isAbsolute(url) || isRelativePath(url)) {
        return toNamespacedPath(url);
    }

    return `./${toNamespacedPath(url)}`;
};
