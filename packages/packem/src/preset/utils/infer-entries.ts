import { existsSync } from "node:fs";
import { env } from "node:process";

import type { PackageJson } from "@visulima/package";
import { resolve } from "@visulima/path";

import { RUNTIME_EXPORT_CONVENTIONS } from "../../constants";
import type { BuildContext, BuildEntry, InferEntriesResult, Runtime } from "../../types";
import type { OutputDescriptor } from "../../utils/extract-export-filenames";
import { extractExportFilenames } from "../../utils/extract-export-filenames";
import { inferExportTypeFromFileName } from "../../utils/infer-export-type";

const getEnvironment = (output: OutputDescriptor): "production" | "development" => {
    if (output.key === "exports" && output.subKey === "production") {
        return "production";
    }

    if (output.key === "exports" && output.subKey === "development") {
        return "development";
    }

    if (env.NODE_ENV) {
        if (!env.NODE_ENV.includes("production") && !env.NODE_ENV.includes("development")) {
            throw new Error(`Invalid NODE_ENV value: ${env.NODE_ENV}, must be either "production" or "development".`);
        }

        return env.NODE_ENV as "production" | "development";
    }

    return "production";
};

const createOrUpdateEntry = (
    entries: BuildEntry[],
    input: string,
    isDirectory: boolean,
    outputSlug: string,
    output: OutputDescriptor,
    packageJson: PackageJson,
    declaration: undefined | false | true | "compatible" | "node16",
    // eslint-disable-next-line sonarjs/cognitive-complexity
): void => {
    const entry = entries.find((index) => index.input === input) ?? (entries[entries.push({ input }) - 1] as BuildEntry);

    if (isDirectory) {
        entry.outDir = outputSlug;
    }

    if (output.isExecutable) {
        entry.executable = true;

        entry.declaration = false;
        entry.cjs = packageJson.type === "commonjs";
        entry.esm = packageJson.type === "module";
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
            if (output.file.includes(runtime + ".")) {
                entry.runtime = runtime as Runtime;

                break;
            }
        }
    }

    if (entry.runtime === undefined) {
        entry.runtime = "node";
    }

    entry.environment = getEnvironment(output);
};

const ENDING_RE = /(?:\.d\.[mc]?ts|\.\w+)$/;

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

    // Come up with a list of all output files & their formats
    const outputs = extractExportFilenames(packageJson.exports, packageJson.type ?? "commonjs", context.options.declaration);

    if (packageJson.bin) {
        const binaries = typeof packageJson.bin === "string" ? [packageJson.bin] : Object.values(packageJson.bin);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const file of binaries) {
            outputs.push({ file: file as string, isExecutable: true, key: "bin" });
        }
    }

    if (packageJson.main) {
        outputs.push({
            file: packageJson.main,
            key: "main",
            type: inferExportTypeFromFileName(packageJson.main) ?? (packageJson.type === "module" ? "esm" : "cjs"),
        });
    }

    // Defacto module entry-point for bundlers (not Node.js)
    // https://github.com/dherman/defense-of-dot-js/blob/master/proposal.md
    if (packageJson.module) {
        outputs.push({ file: packageJson.module, key: "module", type: "esm" });
    }

    // Entry point for TypeScript
    if (context.options.declaration !== false && (packageJson.types || packageJson.typings)) {
        outputs.push({ file: (packageJson.types ?? packageJson.typings) as string, key: "types" });
    }

    // Try to detect output types
    const isESMPackage = packageJson.type === "module";

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const output of outputs.filter((o) => !o.type)) {
        const isJS = output.file.endsWith(".js");

        if ((isESMPackage && isJS) || output.file.endsWith(".mjs")) {
            output.type = "esm";
        } else if ((!isESMPackage && isJS) || output.file.endsWith(".cjs")) {
            output.type = "cjs";
        }
    }

    // Infer entries from package files
    const entries: BuildEntry[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const output of outputs) {
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
        const sourceSlug = outputSlug.replace(new RegExp("(./)?" + context.options.outDir), context.options.sourceDir);

        // @see https://nodejs.org/docs/latest-v16.x/api/packages.html#subpath-patterns
        if (output.file.includes("/*") && output.key === "exports") {
            context.logger.warn("Private subfolders are not supported, if you need this feature please open an issue on GitHub.");

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
                warnings.push(`Could not find entrypoints for \`${output.file}\``);

                // eslint-disable-next-line no-continue
                continue;
            }

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const input of inputs) {
                createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, packageJson, context.options.declaration);
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

        createOrUpdateEntry(entries, input, isDirectory, outputSlug, output, packageJson, context.options.declaration);
    }

    return { entries, warnings };
};

export default inferEntries;
