import { makeLegalIdentifier } from "@rollup/pluginutils";
import { getHash } from "@visulima/packem-share/utils";
import { basename, parse } from "@visulima/path";

import { HASH_REGEXP } from "../constants";

const MODULE_SUFFIX_REGEXP = /\.module$/;

/**
 * For reference, postcss-modules's default:
 * https://github.com/madyankin/postcss-modules/blob/v6.0.0/src/scoping.js#L41
 *
 * FYI LightningCSS recommends hash first for grid compatibility,
 * https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/website/pages/css-modules.md?plain=1#L237-L238
 *
 * but PostCSS CSS Modules doesn't seem to transform Grid names
 */
const generate = (placeholder = "[name]_[local]_[hash:8]") => {
    // The hash depends only on `(file, css)`, not on the individual `local`
    // class name. Memoize it so the whole stylesheet is hashed once per file
    // rather than once per exported class.
    const hashCache = new Map<string, string>();

    return (local: string, file: string, css: string): string => {
        const { base, dir, name } = parse(file);
        const hashKey = `${file}:${css}`;

        let hash = hashCache.get(hashKey);

        if (hash === undefined) {
            hash = getHash(`${base}:${css}`);
            hashCache.set(hashKey, hash);
        }

        const match = HASH_REGEXP.exec(placeholder);
        const hashLength = match && Number.parseInt(match[1] as string, 10);

        return makeLegalIdentifier(
            placeholder
                .replace("[dir]", basename(dir))
                .replace("[name]", name.replace(MODULE_SUFFIX_REGEXP, ""))
                .replace("[local]", local)
                .replace(HASH_REGEXP, hashLength ? hash.slice(0, hashLength) : hash),
        );
    };
};

export default generate;
