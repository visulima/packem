import { isAbsolute, parse, toNamespacedPath } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";

/**
 * Checks if the URL starts with a tilde followed by a digit, '@', or a letter (case-insensitive)
 *
 * @param {string} url
 * @returns {boolean}
 */
export const hasModuleSpecifier = (url: string): boolean => /^~[\d@A-Z]/i.test(url);

export const getUrlOfPartial = (url: string): string => {
    const { base, dir } = parse(url);

    return dir ? `${toNamespacedPath(dir)}/_${base}` : `_${base}`;
};

export const normalizeUrl = (url: string): string => {
    if (hasModuleSpecifier(url)) {
        return toNamespacedPath(url.slice(1));
    }

    if (isAbsolute(url) || isRelative(url)) {
        return toNamespacedPath(url);
    }

    return `./${toNamespacedPath(url)}`;
};
