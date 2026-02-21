import { makeLegalIdentifier } from "@rollup/pluginutils";
import { getHash } from "@visulima/packem-share/utils";
import { basename, parse } from "@visulima/path";

import { HASH_REGEXP } from "../constants";

/**
 * For reference, postcss-modules's default:
 * https://github.com/madyankin/postcss-modules/blob/v6.0.0/src/scoping.js#L41
 *
 * FYI LightningCSS recommends hash first for grid compatibility,
 * https://github.com/parcel-bundler/lightningcss/blob/v1.23.0/website/pages/css-modules.md?plain=1#L237-L238
 *
 * but PostCSS CSS Modules doesn't seem to transform Grid names
 */
const generate =
    (placeholder = "[name]_[local]_[hash:8]") =>
    (local: string, file: string, css: string): string => {
        const { base, dir, name } = parse(file);
        const hash = getHash(`${base}:${css}`);
        const match = HASH_REGEXP.exec(placeholder);
        const hashLength = match && Number.parseInt(match[1] as string, 10);

        return makeLegalIdentifier(
            placeholder
                .replace("[dir]", basename(dir))
                .replace("[name]", name.replace(/\.module$/, ""))
                .replace("[local]", local)
                .replace(HASH_REGEXP, hashLength ? hash.slice(0, hashLength) : hash),
        );
    };

export default generate;
