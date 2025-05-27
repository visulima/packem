import { existsSync } from "node:fs";

import { cyan, grey } from "@visulima/colorize";
import { relative, resolve } from "@visulima/path";

import type { BuildContext, ValidationOptions } from "../../types";
import { extractExportFilenames } from "../../utils/extract-export-filenames";
import levenstein from "../../utils/find-alternatives";
import warn from "../../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePackageEntries = (context: BuildContext): void => {
    const { options } = context;
    const validation = options.validation as ValidationOptions;

    if (validation.packageJson?.exports === false) {
        return;
    }

    let bin: string[] = [];

    if (options.dtsOnly || validation.packageJson?.bin === false) {
        bin = [""];
    } else if (typeof context.pkg.bin === "string") {
        bin = [context.pkg.bin];
    } else if (typeof context.pkg.bin === "object") {
        bin = Object.values(context.pkg.bin as object);
    }

    const packageType = context.pkg.type === "module" ? "esm" : "cjs";

    const filenames = new Set(
        [
            options.declaration && validation.packageJson?.types ? context.pkg.types : "",
            options.declaration && validation.packageJson?.types ? context.pkg.typings : "",
            ...bin,
            options.dtsOnly && validation.packageJson?.main === false ? "" : context.pkg.main,
            options.dtsOnly && validation.packageJson?.module === false ? "" : context.pkg.module,
            ...validation.packageJson?.exports
                ? extractExportFilenames(context.pkg.exports, packageType, options.declaration).map((outputDescriptor) => {
                    if (options.dtsOnly) {
                        if (outputDescriptor.subKey === "types") {
                            return outputDescriptor.file;
                        }

                        return undefined;
                    }

                    return outputDescriptor.file;
                })
                : [],
        ]
            .filter(Boolean)
            .map(
                (index) =>
                    index
                    && resolve(
                        options.rootDir,

                        index.replace(/\/[^*/]*\*[^\n\r/\u2028\u2029]*(?:[\n\r\u2028\u2029][^*/]*\*[^\n\r/\u2028\u2029]*)*(?:\/.*)?$/, ""),
                    ),
            ),
    );

    const missingOutputs: string[] = [];

    for (const filename of filenames) {
        if (filename && !filename.includes("*") && !existsSync(filename)) {
            missingOutputs.push(filename.replace(`${options.rootDir}/`, ""));
        }
    }

    const rPath = (p: string) => relative(options.rootDir, resolve(options.outDir, p));

    const listOfGeneratedFiles = context.buildEntries.filter((bEntry) => !bEntry.chunk).map((bEntry) => rPath(bEntry.path));

    if (missingOutputs.length > 0) {
        let message = "Potential missing or wrong package.json files:";

        for (const missingOutput of missingOutputs) {
            const levensteinOutput = levenstein(missingOutput, listOfGeneratedFiles);

            message
                += `\n  - ${
                    cyan(missingOutput)
                }${levensteinOutput.length > 0 ? grey` (did you mean ${levensteinOutput.map((output) => `"${output}"`).join(", ")}?)` : ""}`;
        }

        warn(context, message);
    }
};

export default validatePackageEntries;
