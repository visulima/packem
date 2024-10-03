import { makeLegalIdentifier } from "@rollup/pluginutils";
import { basename, parse } from "@visulima/path";

import hasher from "../../../utils/hasher";
import { HASH_REGEXP } from "../constants";

const generate =
    (placeholder = "[name]_[local]__[hash:8]") =>
    (local: string, file: string, css: string): string => {
        const { base, dir, name } = parse(file);
        const hash = hasher(`${base}:${css}`);
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
