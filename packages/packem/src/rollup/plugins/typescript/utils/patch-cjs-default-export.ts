import MagicString from "magic-string";
import type { SourceMap } from "rollup";

import getRegexMatches from "../../../../utils/get-regex-matches";

const patchCjsDefaultExport = (
    source: string,
): {
    code: string;
    map: SourceMap;
} | null => {
    // will match `export { ... }` statement
    const matches: string[] = getRegexMatches(/export\s(\{\s(.*)\s\}|default\s.*);/g, source);

    if (matches.length === 0) {
        return null;
    }

    // we need the last match
    const splitMatches = (matches.at(-1) as string).split(", ");

    let defaultKey = "";

    for (const match of splitMatches) {
        if (match.includes("type")) {
            continue;
        }

        if (match.includes("default ")) {
            defaultKey = match.split("default ")[1] as string;
        }

        if (match.includes("as")) {
            const [original, alias] = match.split(" as ");

            if (alias === "default") {
                defaultKey = original as string;
            }
        }
    }

    if (defaultKey !== "") {
        const dtsTransformed = new MagicString(source);

        dtsTransformed.replace(new RegExp(`(,s)?${defaultKey} as default(,)?`), "");

        dtsTransformed.replace(new RegExp(`export default ${defaultKey};\n?`), "");
        dtsTransformed.append(`\n\nexport = ${defaultKey};`);

        return {
            // replace a empty export statement
            code: dtsTransformed.toString().replace(/export\s\{\s\s\};/, ""),
            map: dtsTransformed.generateMap({ hires: true }),
        };
    }

    return null;
};

export default patchCjsDefaultExport;
