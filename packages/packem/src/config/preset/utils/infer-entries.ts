import { isAccessibleSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { extname, resolve, toNamespacedPath } from "@visulima/path";

import { DEFAULT_EXTENSIONS, DEVELOPMENT_ENV, ENDING_REGEX, PRODUCTION_ENV, RUNTIME_EXPORT_CONVENTIONS, SPECIAL_EXPORT_CONVENTIONS } from "../../../constants";
import type { BuildContext, BuildEntry, Environment, InferEntriesResult, Runtime } from "../../../types";
import type { OutputDescriptor } from "../../../utils/extract-export-filenames";
import { extractExportFilenames } from "../../../utils/extract-export-filenames";
import { inferExportTypeFromFileName } from "../../../utils/infer-export-type";

const getEnvironment = (output: OutputDescriptor, environment: Environment): Environment => {
    if (output.key === "exports" && output.subKey === PRODUCTION_ENV) {
        return PRODUCTION_ENV as Environment;
    }

    if (output.key === "exports" && output.subKey === DEVELOPMENT_ENV) {
        return DEVELOPMENT_ENV as Environment;
    }

    return environment;
};

const createOrUpdateEntry = (
    entries: BuildEntry[],
    input: string,
    isDirectory: boolean,
    outputSlug: string,
    output: OutputDescriptor,
    context: BuildContext,
    isGlob: boolean,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): void => {
    const entryEnvironment = getEnvironment(output, context.environment);

    let runtime: Runtime = context.options.runtime as Runtime;

    for (const runtimeExportConvention of RUNTIME_EXPORT_CONVENTIONS) {
        if (output.file.includes(`.${runtimeExportConvention}.`) || output.subKey === runtimeExportConvention) {
            runtime = runtimeExportConvention as Runtime;

            break;
        }
    }

    let entry: BuildEntry | undefined = entries.find((index) => index.input === input && index.environment === entryEnvironment && index.runtime === runtime);

    if (entry === undefined) {
        entry = entries[
            entries.push({ environment: entryEnvironment, exportKey: new Set([output.exportKey].filter(Boolean)), input, runtime }) - 1
        ] as BuildEntry;
    } else if (entry.exportKey && output.exportKey) {
        entry.exportKey.add(output.exportKey);
    }

    if (isGlob) {
        entry.isGlob = true;
    }

    if (isDirectory) {
        entry.outDir = outputSlug;
    }

    if (output.isExecutable) {
        entry.executable = true;

        entry.declaration = false;

        if (output.type === "cjs") {
            entry.cjs = true;
        } else if (output.type === "esm") {
            entry.esm = true;
        }
    } else {
        if (/\.d\.[mc]?ts$/.test(output.file) && context.options.declaration !== false) {
            entry.declaration = context.options.declaration;
        }

        if (output.type === "cjs") {
            entry.cjs = true;
        } else if (output.type === "esm") {
            entry.esm = true;
        }
    }

    const aliasName = output.file.replace(extname(output.file), "").replace(new RegExp(`^./${context.options.outDir.replace(/^\.\//, "")}/`), "");

    if (SPECIAL_EXPORT_CONVENTIONS.has(output.subKey as string) && !input.includes(aliasName)) {
        entry.fileAlias = aliasName;
    }
};

let privateSubfolderWarningShown = false;

const validateIfTypescriptIsInstalled = (context: BuildContext): void => {
    if (context.pkg?.dependencies?.typescript === undefined && context.pkg?.devDependencies?.typescript === undefined) {
        // @TODO: Add command to install typescript
        throw new Error("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json.");
    }
};

/**
 * Infer entries from package files.
 * @param packageJson
 * @param sourceFiles A list of source files to use for inferring entries.
 * @param context
 * @returns
 */
const inferEntries = (
    packageJson: PackageJson,
    sourceFiles: string[],
    context: BuildContext,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): InferEntriesResult => {
    const warnings: string[] = [];

    const cjsJSExtension = (context.options.outputExtensionMap?.cjs ?? "cjs").replaceAll(".", String.raw`\.`);
    const esmJSExtension = (context.options.outputExtensionMap?.esm ?? "mjs").replaceAll(".", String.raw`\.`);

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

    for (const output of outputs) {
        const outputExtension = extname(output.file);

        // Only javascript files are supported
        if (outputExtension !== "" && !DEFAULT_EXTENSIONS.includes(outputExtension)) {
            continue;
        }

        if (context.options.declaration === undefined && (output.key === "types" || output.subKey === "types")) {
            context.options.declaration = output.file.includes(".d.ts") ? "compatible" : true;
        }

        if (context.options.emitCJS === undefined && output.type === "cjs") {
            context.options.emitCJS = true;
        }

        if (context.options.emitESM === undefined && output.type === "esm") {
            context.options.emitESM = true;
        }

        // Supported output file extensions are `.d.ts`, `.d.cts`, `.d.mts`, `.js`, `.cjs` and `.mjs`
        // But we support any file extension here in case user has extended rollup options
        const outputSlug = output.file.replace(new RegExp(String.raw`(?:\*[^/\\]|\.d\.[mc]?ts|\.\w+|${[
            `\\.${cjsJSExtension}`,
            `\\.${esmJSExtension}`,
        ].join("|")})$`), "");

        const isDirectory = outputSlug.endsWith("/");

        // Skip top level directory
        if (isDirectory && ["./", "/"].includes(outputSlug)) {
            continue;
        }

        const sourceSlug = outputSlug.replace(new RegExp(`(./)?${context.options.outDir}`), context.options.sourceDir).replace("./", "");

        const beforeSourceRegex = "(?<=/|$)";
        const fileExtensionRegex = isDirectory
            ? ""
            : String.raw`(\.d\.[cm]?ts|(\.[cm]?[tj]sx?)|${[
                `\\.${cjsJSExtension}`,
                `\\.${esmJSExtension}`,
            ].join("|")})$`;

        // @see https://nodejs.org/docs/latest-v16.x/api/packages.html#subpath-patterns
        if (output.file.includes("/*") && output.key === "exports") {
            if (!privateSubfolderWarningShown) {
                context.logger.debug("Private subfolders are not supported, if you need this feature please open an issue on GitHub.");

                privateSubfolderWarningShown = true;
            }

            const inputs: string[] = [];

            const SOURCE_RE = new RegExp(beforeSourceRegex + sourceSlug.replace("*", "(.*)") + fileExtensionRegex);
            const SPECIAL_SOURCE_RE = new RegExp(beforeSourceRegex + sourceSlug.replace(/(.*)\.[^.]*$/, "$1").replace("*", "(.*)") + fileExtensionRegex);

            for (const source of sourceFiles) {
                if (SOURCE_RE.test(source) || (SPECIAL_EXPORT_CONVENTIONS.has(output.subKey as string) && SPECIAL_SOURCE_RE.test(source))) {
                    inputs.push(source);
                }
            }

            if (inputs.length === 0) {
                warnings.push(`Could not find entrypoint for \`${output.file}\``);

                continue;
            }

            for (const input of inputs) {
                createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, context, true);
            }

            continue;
        }

        const SOURCE_RE = new RegExp(beforeSourceRegex + sourceSlug + fileExtensionRegex);

        let input = sourceFiles.find((index) => SOURCE_RE.test(index));

        if (SPECIAL_EXPORT_CONVENTIONS.has(output.subKey as string) && input === undefined) {
            // Use a safer regex pattern to avoid backtracking issues
            const sourceSlugWithoutExtension = sourceSlug.replace(/^(.+?)\.[^.]*$/, "$1");
            const SPECIAL_SOURCE_RE = new RegExp(beforeSourceRegex + sourceSlugWithoutExtension + fileExtensionRegex);

            input = sourceFiles.find((index) => SPECIAL_SOURCE_RE.test(index));
        }

        if (input === undefined) {
            if (!isAccessibleSync(resolve(context.options.rootDir, output.file))) {
                warnings.push(`Could not find entrypoint for \`${output.file}\``);
            }

            continue;
        }

        if (isAccessibleSync(input) && /\.[cm]?tsx?$/.test(input)) {
            validateIfTypescriptIsInstalled(context);
        }

        const inputWithoutExtension = toNamespacedPath(input.replace(ENDING_REGEX, ""));

        if (isAccessibleSync(`${inputWithoutExtension}.cts`) && isAccessibleSync(`${inputWithoutExtension}.mts`)) {
            createOrUpdateEntry(entries, `${inputWithoutExtension}.cts`, isDirectory, outputSlug, { ...output, type: "cjs" }, context, false);
            createOrUpdateEntry(entries, `${inputWithoutExtension}.mts`, isDirectory, outputSlug, { ...output, type: "esm" }, context, false);
        } else {
            createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, context, false);
        }
    }

    return { entries, warnings };
};

export default inferEntries;
