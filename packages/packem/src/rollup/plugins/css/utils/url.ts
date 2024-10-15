import { isAbsolute, normalize, parse } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";

/**
 * Checks if the URL starts with a tilde followed by a digit, '@', or a letter (case-insensitive)
 *
 * @param {string} url
 * @returns {boolean}
 */
export const hasModuleSpecifier = (url: string): boolean => /^~[\d@A-Z]/i.test(url);

// handle importing Sass partials in node_modules
// @import ~foo/bar/partial where "partial" has the filename "_partial.scss".
export const getUrlOfPartial = (url: string): string => {
    const { base, dir } = parse(url);

    return dir ? `${normalize(dir)}/_${base}` : `_${base}`;
};

export const normalizeUrl = (url: string): string => {
    if (hasModuleSpecifier(url)) {
        return normalize(url.slice(1));
    }

    if (isAbsolute(url) || isRelative(url)) {
        return normalize(url);
    }

    return "./" + normalize(url);
};
