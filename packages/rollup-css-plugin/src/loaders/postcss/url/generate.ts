import { getHash } from "@visulima/packem-share/utils";
import { basename, parse } from "@visulima/path";

import { HASH_REGEXP } from "../constants";

export default (placeholder: string, file: string, source: Uint8Array): string => {
    const { base, dir, ext, name } = parse(file);
    const hash = getHash(`${base}:${Buffer.from(source).toString()}`);
    const match = HASH_REGEXP.exec(placeholder);
    const hashLength = match && Number.parseInt(match[1] as string, 10);

    return placeholder
        .replace("[dir]", basename(dir))
        .replace("[name]", name)
        .replace("[extname]", ext)
        .replace(".[ext]", ext)
        .replace("[ext]", ext.slice(1))
        .replace(HASH_REGEXP, hashLength ? hash.slice(0, hashLength) : hash.slice(0, 8));
};
