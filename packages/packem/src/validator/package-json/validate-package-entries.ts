import { existsSync } from "node:fs";

import { cyan, grey } from "@visulima/colorize";
import { relative, resolve } from "@visulima/path";

import type { BuildContext } from "../../types";
import { extractExportFilenames } from "../../utils/extract-export-filenames";
import levenstein from "../../utils/levenstein";
import warn from "../../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const validatePackageEntries = (context: BuildContext): void => {
    const { options } = context;

    if (options.validation?.packageJson?.exports === false) {
        return;
    }

    const packageJson = options.validation?.packageJson;

    const filenames = new Set(
        [
            options.declaration && packageJson?.types ? context.pkg.types : "",
            options.declaration && packageJson?.types ? context.pkg.typings : "",
            ...(options.dtsOnly || packageJson?.bin === false
                ? [""]
                : typeof context.pkg.bin === "string"
                  ? [context.pkg.bin]
                  : Object.values(context.pkg.bin ?? {})),
            options.dtsOnly && packageJson?.main === false ? "" : context.pkg.main,
            options.dtsOnly && packageJson?.module === false ? "" : context.pkg.module,
            ...(packageJson?.exports === false
                ? []
                : extractExportFilenames(context.pkg.exports, context.pkg.type === "module" ? "esm" : "cjs", options.declaration).map((outputDescriptor) => {
                      if (options.dtsOnly) {
                          if (outputDescriptor.subKey === "types") {
                              return outputDescriptor.file;
                          }

                          return undefined;
                      }

                      return outputDescriptor.file;
                  })),
        ]
            .filter(Boolean)
            .map(
                (index) =>
                    index &&
                    resolve(
                        options.rootDir,
                        // eslint-disable-next-line security/detect-unsafe-regex
                        index.replace(/\/[^*/]*\*[^\n\r/\u2028\u2029]*(?:[\n\r\u2028\u2029][^*/]*\*[^\n\r/\u2028\u2029]*)*(?:\/.*)?$/, ""),
                    ),
            ),
    );

    const missingOutputs = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const filename of filenames) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (filename && !filename.includes("*") && !existsSync(filename)) {
            missingOutputs.push(filename.replace(`${options.rootDir}/`, ""));
        }
    }

    const rPath = (p: string) => relative(options.rootDir, resolve(options.outDir, p));

    const listOfGeneratedFiles = context.buildEntries.filter((bEntry) => !bEntry.chunk).map((bEntry) => rPath(bEntry.path));

    if (missingOutputs.length > 0) {
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

    if (
        packageJson?.typesVersions !== false &&
        options.declaration === "compatible" &&
        options.rollup.node10Compatibility &&
        options.rollup.node10Compatibility.writeToPackageJson !== true
    ) {
        let typescriptVersion = "*";

        if (options.rollup.node10Compatibility.typeScriptVersion) {
            typescriptVersion = options.rollup.node10Compatibility.typeScriptVersion;
        }

        // eslint-disable-next-line security/detect-object-injection
        if (context.pkg.typesVersions?.[typescriptVersion]?.["*"] === undefined || context.pkg.typesVersions[typescriptVersion]?.["*"]?.length === 0) {
            warn(
                context,
                "No typesVersions entry found in package.json, change the declaration option to 'node16' or 'false' or enable the writeToPackageJson in the node10Compatibility option.",
            );
        }
    }
};

export default validatePackageEntries;
