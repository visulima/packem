import MagicString from "magic-string";
import type { SourceMap } from "rollup";

const patchCjsDefaultExport = (
    source: string,
): null | {
    code: string;
    map: SourceMap;
} => {
    let matches: string[] = [];

    let regexMatches;
    // will match `export { ... }` statement
    const regex = /export\s(\{\s(.*)\s\}|default\s.*);/g;

    // eslint-disable-next-line no-cond-assign
    while ((regexMatches = regex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (regexMatches.index === regex.lastIndex) {
            // eslint-disable-next-line no-plusplus
            regex.lastIndex++;
        }

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        regexMatches.forEach((match) => {
            matches.push(match);
        });
    }

    matches = matches.filter(Boolean);

    if (matches.length === 0) {
        return null;
    }

    // we need the last match
    const splitMatches = (matches.at(-1) as string).split(", ");

    let defaultKey = "";

    for (const match of splitMatches) {
        if (match.includes("type")) {
            // eslint-disable-next-line no-continue
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

        // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
        dtsTransformed.replace(new RegExp(`(,s)?${defaultKey} as default(,)?`), "");
        // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
        dtsTransformed.replace(new RegExp(`export default ${defaultKey};\n?`), "");
        dtsTransformed.append("\n\nexport = " + defaultKey + ";");

        return {
            // replace a empty export statement
            code: dtsTransformed.toString().replace(/export\s\{\s\s\};/, ""),
            map: dtsTransformed.generateMap({ hires: true }),
        };
    }

    return null;
};

export default patchCjsDefaultExport;
