import { existsSync } from "node:fs";

import { cyan, grey } from "@visulima/colorize";
import type { BuildContext } from "@visulima/packem-share/types";
import { warn } from "@visulima/packem-share/utils";
import { relative, resolve } from "@visulima/path";

import type { InternalBuildOptions, ValidationOptions } from "../../types";
import { extractExportFilenames } from "../../utils/extract-export-filenames";
import levenstein from "../../utils/find-alternatives";

// Strips a trailing glob segment (and anything after it) so wildcard export
// entries resolve to their containing directory.
const GLOB_SUFFIX_REGEX = /\/[^*/]*\*[^\n\r/\u2028\u2029]*(?:[\n\r\u2028\u2029][^*/]*\*[^\n\r/\u2028\u2029]*)*(?:\/.*)?$/;

const collectExportFilenames = (context: BuildContext<InternalBuildOptions>, packageType: "cjs" | "esm"): (string | undefined)[] => {
    const { options } = context;

    return extractExportFilenames(context.pkg.exports, packageType, options.declaration, [], options.ignoreExportKeys ?? [])
        .filter((outputDescriptor) => !outputDescriptor.ignored)
        .map((outputDescriptor) => {
            if (options.dtsOnly) {
                return outputDescriptor.subKey === "types" ? outputDescriptor.file : undefined;
            }

            return outputDescriptor.file;
        });
};

const resolveBinEntries = (context: BuildContext<InternalBuildOptions>, validateBin: boolean): string[] => {
    if (context.options.dtsOnly || !validateBin) {
        return [""];
    }

    if (typeof context.pkg.bin === "string") {
        return [context.pkg.bin];
    }

    if (typeof context.pkg.bin === "object") {
        return Object.values(context.pkg.bin as Record<string, string>);
    }

    return [];
};

const buildMissingOutputsMessage = (missingOutputs: string[], listOfGeneratedFiles: string[]): string => {
    let message = "Potential missing or wrong package.json files:";

    for (const missingOutput of missingOutputs) {
        const levensteinOutput = levenstein(missingOutput, listOfGeneratedFiles);

        message += `\n  - ${cyan(
            missingOutput,
        )}${levensteinOutput.length > 0 ? grey` (did you mean ${levensteinOutput.map((output) => `"${output}"`).join(", ")}?)` : ""}`;
    }

    return message;
};

const validatePackageEntries = (context: BuildContext<InternalBuildOptions>): void => {
    const { options } = context;
    const validation = options.validation as ValidationOptions;
    const { packageJson } = validation;

    if (!packageJson?.exports) {
        return;
    }

    const bin = resolveBinEntries(context, Boolean(packageJson.bin));

    const packageType = context.pkg.type === "module" ? "esm" : "cjs";

    const filenames = new Set(
        [
            options.declaration && packageJson.types ? context.pkg.types : "",
            options.declaration && packageJson.types ? context.pkg.typings : "",
            ...bin,
            options.dtsOnly && !packageJson.main ? "" : context.pkg.main,
            options.dtsOnly && !packageJson.module ? "" : context.pkg.module,
            ...collectExportFilenames(context, packageType),
        ]
            .filter(Boolean)
            .map((index) => index && resolve(options.rootDir, index.replace(GLOB_SUFFIX_REGEX, ""))),
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
        const message = buildMissingOutputsMessage(missingOutputs, listOfGeneratedFiles);

        warn(context, message);
    }
};

export default validatePackageEntries;
