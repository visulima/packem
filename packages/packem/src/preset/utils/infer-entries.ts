import { existsSync } from "node:fs";

import { isAccessibleSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { resolve } from "@visulima/path";

import { DEVELOPMENT_ENV, PRODUCTION_ENV, RUNTIME_EXPORT_CONVENTIONS } from "../../constants";
import type { BuildContext, BuildEntry, Environment, InferEntriesResult, Runtime } from "../../types";
import type { OutputDescriptor } from "../../utils/extract-export-filenames";
import { extractExportFilenames } from "../../utils/extract-export-filenames";
import { inferExportTypeFromFileName } from "../../utils/infer-export-type";

const getEnvironment = (output: OutputDescriptor, environment: Environment): Environment => {
    if (output.key === "exports" && output.subKey === PRODUCTION_ENV) {
        return PRODUCTION_ENV;
    }

    if (output.key === "exports" && output.subKey === DEVELOPMENT_ENV) {
        return DEVELOPMENT_ENV;
    }

    return environment;
};

const createOrUpdateEntry = (
    entries: BuildEntry[],
    input: string,
    isDirectory: boolean,
    outputSlug: string,
    output: OutputDescriptor,
    declaration: undefined | false | true | "compatible" | "node16",
    environment: Environment,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): void => {
    const entryEnvironment = getEnvironment(output, environment);

    let entry: BuildEntry | undefined = entries.find((index) => index.input === input && index.environment === entryEnvironment);

    if (entry === undefined) {
        entry = entries[entries.push({ input }) - 1] as BuildEntry;
    }

    if (isDirectory) {
        entry.outDir = outputSlug;
    }

    if (output.isExecutable) {
        entry.executable = true;

        entry.declaration = false;

        if (output.type === "cjs") {
            entry.cjs = true;
        }

        if (output.type === "esm") {
            entry.esm = true;
        }
    } else {
        if (/\.d\.[mc]?ts$/.test(output.file) && declaration !== false) {
            entry.declaration = declaration;
        }

        if (output.type === "cjs") {
            entry.cjs = true;
        }

        if (output.type === "esm") {
            entry.esm = true;
        }

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const runtime of RUNTIME_EXPORT_CONVENTIONS) {
            if (output.file.includes("." + runtime + ".")) {
                entry.runtime = runtime as Runtime;

                break;
            }
        }
    }

    if (entry.runtime === undefined) {
        entry.runtime = "node";
    }

    entry.environment = entryEnvironment;

    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    if ([DEVELOPMENT_ENV, PRODUCTION_ENV].includes(output.subKey as string) && output.file.includes("." + output.subKey + ".")) {
        entry.fileAlias = true;
    }
};

const ENDING_RE = /(?:\.d\.[mc]?ts|\.\w+)$/;

let privateSubfolderWarningShown = false;

const validateIfTypescriptIsInstalled = (context: BuildContext): void => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (context.pkg?.dependencies?.typescript === undefined && context.pkg?.devDependencies?.typescript === undefined) {
        // @TODO Add command to install typescript
        throw new Error("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json.");
    }
};

/**
 * Infer entries from package files.
 *
 * @param {PackageJson} packageJson
 * @param {string[]} sourceFiles A list of source files to use for inferring entries.
 * @param {BuildContext} context
 * @returns {InferEntriesResult}
 */
const inferEntries = (
    packageJson: PackageJson,
    sourceFiles: string[],
    context: BuildContext,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): InferEntriesResult => {
    const warnings = [];

    // Sort files so least-nested files are first
    sourceFiles.sort((a, b) => a.split("/").length - b.split("/").length);

    const packageType = packageJson.type === "module" ? "esm" : "cjs";

    if (packageType === "esm") {
        context.options.emitESM = true;
    }

    if (packageType === "cjs") {
        context.options.emitCJS = true;
    }

    // Come up with a list of all output files & their formats
    const outputs = extractExportFilenames(packageJson.exports, packageType, context.options.declaration);

    if (packageJson.bin) {
        const binaries = (typeof packageJson.bin === "string" ? [packageJson.bin] : Object.values(packageJson.bin)).filter(Boolean);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const file of binaries) {
            const inferredType = inferExportTypeFromFileName(file);

            if (inferredType && inferredType !== packageType) {
                throw new Error(`Exported file "${file}" has an extension that does not match the package.json type "${packageJson.type ?? "commonjs"}".`);
            }

            outputs.push({ file: file as string, isExecutable: true, key: "bin", type: inferredType ?? packageType });
        }
    }

    if (packageJson.main) {
        outputs.push({
            file: packageJson.main,
            key: "main",
            type: inferExportTypeFromFileName(packageJson.main) ?? packageType,
        });
    }

    // Defacto module entry-point for bundlers (not Node.js)
    // https://github.com/dherman/defense-of-dot-js/blob/master/proposal.md
    if (packageJson.module) {
        outputs.push({ file: packageJson.module, key: "module", type: "esm" });
    }

    // Entry point for TypeScript
    if (packageJson.types || packageJson.typings) {
        validateIfTypescriptIsInstalled(context);

        if (context.options.declaration === undefined) {
            context.options.declaration = "compatible";
        }

        outputs.push({ file: (packageJson.types ?? packageJson.typings) as string, key: "types" });
    }

    // Infer entries from package files
    const entries: BuildEntry[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const output of outputs) {
        if (context.options.declaration === undefined && (output.key === "types" || output.subKey === "types")) {
            context.options.declaration = output.file.includes(".d.ts") ? "compatible" : true;
        }

        if (context.options.emitCJS === undefined && output.type === "cjs") {
            context.options.emitCJS = true;
        }

        if (context.options.emitESM === undefined && output.type === "esm") {
            context.options.emitESM = true;
        }

        // Supported output file extensions are `.d.ts`, `.cjs` and `.mjs`
        // But we support any file extension here in case user has extended rollup options
        const outputSlug = output.file.replace(/(?:\*[^/\\]|\.d\.[mc]?ts|\.\w+)$/, "");

        const isDirectory = outputSlug.endsWith("/");

        // Skip top level directory
        if (isDirectory && ["./", "/"].includes(outputSlug)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
        let sourceSlug = outputSlug.replace(new RegExp("(./)?" + context.options.outDir), context.options.sourceDir).replace("./", "");

        // If entry is a development or production entry, remove the subKey from the sourceSlug to find the correct source file
        if (output.subKey === DEVELOPMENT_ENV || output.subKey === PRODUCTION_ENV) {
            sourceSlug = sourceSlug.replace("." + output.subKey, "");
        }

        // @see https://nodejs.org/docs/latest-v16.x/api/packages.html#subpath-patterns
        if (output.file.includes("/*") && output.key === "exports") {
            if (!privateSubfolderWarningShown) {
                context.logger.debug("Private subfolders are not supported, if you need this feature please open an issue on GitHub.");

                privateSubfolderWarningShown = true;
            }

            const inputs: string[] = [];

            // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
            const SOURCE_RE = new RegExp("(?<=/|$)" + sourceSlug.replace("*", "(.*)") + (isDirectory ? "" : "\\.\\w+"));
            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const source of sourceFiles) {
                if (SOURCE_RE.test(source)) {
                    inputs.push(source.replace(ENDING_RE, ""));
                }
            }

            if (inputs.length === 0) {
                warnings.push(`Could not find entrypoint for \`${output.file}\``);

                // eslint-disable-next-line no-continue
                continue;
            }

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const input of inputs) {
                createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, context.options.declaration, context.environment);
            }

            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
        const SOURCE_RE = new RegExp("(?<=/|$)" + sourceSlug + (isDirectory ? "" : "\\.\\w+"));

        const input = sourceFiles.find((index) => SOURCE_RE.test(index))?.replace(ENDING_RE, "");

        if (!input) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            if (!existsSync(resolve(context.options.rootDir, output.file))) {
                warnings.push(`Could not find entrypoint for \`${output.file}\``);
            }

            // eslint-disable-next-line no-continue
            continue;
        }

        if (isAccessibleSync(input + ".ts") || isAccessibleSync(input + ".cts") || isAccessibleSync(input + ".mts")) {
            validateIfTypescriptIsInstalled(context);
        }

        if (isAccessibleSync(input + ".cts") && isAccessibleSync(input + ".mts")) {
            createOrUpdateEntry(entries, input + ".cts", isDirectory, outputSlug, { ...output, type: "cjs" }, context.options.declaration, context.environment);
            createOrUpdateEntry(entries, input + ".mts", isDirectory, outputSlug, { ...output, type: "esm" }, context.options.declaration, context.environment);
        } else {
            createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, context.options.declaration, context.environment);
        }
    }

    return { entries, warnings };
};

export default inferEntries;
