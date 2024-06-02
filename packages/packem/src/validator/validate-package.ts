import { existsSync } from "node:fs";

import { cyan, grey } from "@visulima/colorize";
import type { PackageJson } from "@visulima/package";
import { relative, resolve } from "@visulima/path";

import type { BuildContext } from "../types";
import { extractExportFilenames } from "../utils/extract-export-filenames";
import levenstein from "../utils/levenstein";
import warn from "../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePackage = (package_: PackageJson, context: BuildContext): void => {
    const filenames = new Set(
        [
            ...(typeof package_.bin === "string" ? [package_.bin] : Object.values(package_.bin ?? {})),
            package_.main,
            package_.module,
            context.options.declaration ? package_.types : "",
            context.options.declaration ? package_.typings : "",
            ...extractExportFilenames(package_.exports, package_.type ?? "commonjs", context.options.declaration).map((index) => index.file),
        ].map(
            (index) =>
                index &&
                // eslint-disable-next-line security/detect-unsafe-regex
                resolve(context.rootDir, index.replace(/\/[^*/]*\*[^\n\r/\u2028\u2029]*(?:[\n\r\u2028\u2029][^*/]*\*[^\n\r/\u2028\u2029]*)*(?:\/.*)?$/, "")),
        ),
    );

    const missingOutputs = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const filename of filenames) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (filename && !filename.includes("*") && !existsSync(filename)) {
            missingOutputs.push(filename.replace(`${context.rootDir}/`, ""));
        }
    }

    if (missingOutputs.length > 0) {
        const rPath = (p: string) => relative(context.rootDir, resolve(context.options.outDir, p));

        const listOfGeneratedFiles = context.buildEntries.filter((bEntry) => !bEntry.chunk).map((bEntry) => rPath(bEntry.path));

        let message = "Potential missing or wrong package.json files:";

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const missingOutput of missingOutputs) {
            const levensteinOutput = levenstein(missingOutput, listOfGeneratedFiles);

            message +=
                "\n  - " +
                cyan(missingOutput) +
                (levensteinOutput.length > 0 ? grey` (did you mean ${levensteinOutput.map((output) => `"${output}"`).join(", ")}?)` : "");
        }

        warn(context, message);
    }
};

export default validatePackage;
