import child_process from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { promisify } from "node:util";

import type { ProblemKind, ResolutionKind } from "@arethetypeswrong/core";
import { blue, bold, dim, green, red, yellow } from "@visulima/colorize";
import type { NormalizedPackageJson } from "@visulima/package";
import { ensurePackages } from "@visulima/package";
import type { BuildContext } from "@visulima/packem-share/types";
import { join } from "@visulima/path";
import { createTable } from "@visulima/tabular";
import { ROUNDED_BORDER } from "@visulima/tabular/style";

import loadPackageJson from "../config/utils/load-package-json";
import type { AttwOptions, InternalBuildOptions, ValidationOptions } from "../types";

const exec = promisify(child_process.exec);

// eslint-disable-next-line func-style
function memo<Arguments extends (string | number)[], Result>(function_: (...arguments_: Arguments) => Result): (...arguments_: Arguments) => Result {
    const cache = new Map();

    return (...arguments_): Result => {
        const key = arguments_.toString();

        if (cache.has(key)) {
            return cache.get(key) as Result;
        }

        const result = function_(...arguments_);

        cache.set(key, result);

        return result;
    };
}

const resolutionKinds: Record<ResolutionKind, string> = {
    bundler: "bundler",
    node10: "node10",
    "node16-cjs": "node16 (from CJS)",
    "node16-esm": "node16 (from ESM)",
};

const moduleKinds = {
    "": "",
    1: "(CJS)",
    99: "(ESM)",
};

const problemKindColors: Record<ProblemKind, (text: string) => string> = {
    CJSOnlyExportsDefault: blue,
    CJSResolvesToESM: yellow,
    FallbackCondition: yellow,
    FalseCJS: red,
    FalseESM: red,
    FalseExportDefault: blue,
    InternalResolutionError: red,
    MissingExportEquals: blue,
    NamedExports: yellow,
    NoResolution: red,
    UnexpectedModuleSyntax: red,
    UntypedResolution: yellow,
};

/**
 * ATTW profiles.
 * Defines the resolution modes to ignore for each profile.
 * @see https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/packages/cli/README.md#profiles
 */
const profiles: Record<Required<AttwOptions>["profile"], string[]> = {
    esmOnly: ["node10", "node16-cjs"],
    node16: ["node10"],
    strict: [],
};

/**
 * Start.
 *
 * Modified copies of https://github.com/publint/publint/blob/master/packages/pack/src/node/pack-as-json.js#L63
 * and
 * https://github.com/publint/publint/blob/master/packages/pack/src/node/pack-as-json.js#L83
 *
 * MIT License
 * Copyright (c) 2025 Bjorn Lu and publint contributors
 */
// pnpm outputs lifecycle script logs if not ignoring scripts

/**
 * @param stdout
 */
const fixPnpmStdout = (stdout: string) => {
    // If starts with `{`, it's likely a valid JSON
    if (stdout.startsWith("{"))
        return stdout;

    // Otherwise try to find its usual output format, `{\n  "name": ...`
    const usualStartIndex = /\{\s*"name"/.exec(stdout)?.index;

    if (usualStartIndex != undefined)
        return stdout.slice(usualStartIndex);

    // Otherwise, simply try to find the first `{` character
    const firstBraceIndex = stdout.indexOf("{");

    if (firstBraceIndex !== -1)
        return stdout.slice(firstBraceIndex);

    // If all fails, return the original stdout
    return stdout;
};

// yarn outputs invalid json for some reason

/**
 * @param stdout
 */
const fixYarnStdout = (stdout: string): string => {
    const lines = stdout.split("\n");
    // Combine lines as arrays
    let fixedStdout = "[";

    for (const line of lines) {
        if (line)
            fixedStdout += `${line},`;
    }

    // Remove trailing slash
    if (fixedStdout[fixedStdout.length - 1] === ",") {
        fixedStdout = fixedStdout.slice(0, -1);
    }

    fixedStdout += "]";

    return fixedStdout;
};

/**
 * End.
 */

const attw = async (context: BuildContext<InternalBuildOptions>, logged: boolean): Promise<void> => {
    if (!context.options?.validation) {
        return;
    }

    const validation = context.options.validation as ValidationOptions;

    if (!validation.attw) {
        return;
    }

    const { packageJson } = loadPackageJson(context.options.rootDir);

    context.logger.log(packageJson);
    context.pkg = packageJson;

    if (logged) {
        context.logger.raw("\n");
    }

    if (!context.pkg) {
        context.logger.warn({
            message: "attw is enabled but package.json is not found",
            prefix: "attw",
        });

        return;
    }

    await ensurePackages(context.pkg as NormalizedPackageJson, ["@arethetypeswrong/core", "package-manager-detector"], "devDependencies", {
        logger: {
            warn: (message: string) => {
                context.logger.warn({
                    message,
                    prefix: "attw",
                });
            },
        },
    });

    // eslint-disable-next-line prefer-const
    let { level = "warn", pm = "auto", profile = "strict", ...attwOptions } = validation.attw === true ? {} : validation.attw;

    const t = performance.now();

    context.logger.debug({
        message: "Running attw check",
        prefix: "attw",
    });

    const temporaryDirectory = await mkdtemp(join(tmpdir(), "packem-attw-"));

    let attwCore: typeof import("@arethetypeswrong/core");

    try {
        attwCore = await import("@arethetypeswrong/core");
    } catch {
        context.logger.error({
            message: `ATTW check requires ${blue`@arethetypeswrong/core`} to be installed.`,
            prefix: "attw",
        });

        return;
    }

    let packageManager: string | undefined;

    switch (pm) {
        case "auto": {
            const { detect } = await import("package-manager-detector/detect");

            const dpm = await detect({ cwd: context.options.rootDir });

            if (dpm) {
                if (dpm.name === "bun") {
                    throw new Error("Bun does not support --json on the pack command");
                }

                packageManager = dpm.name;
            }

            break;
        }
        case "bun": {
            throw new Error("Bun does not support --json on the pack command");
        }
        case "pnpm": {
            packageManager = "pnpm";
            break;
        }
        case "yarn": {
            packageManager = "yarn";
            break;
        }
        default: {
            packageManager = "npm";
        }
    }

    const { allResolutionKinds, getResolutionOption, groupProblemsByKind } = await import("@arethetypeswrong/core/utils");
    const { filterProblems, problemAffectsEntrypoint, problemAffectsResolutionKind, problemKindInfo } = await import("@arethetypeswrong/core/problems");

    try {
        let destination = `--pack-destination ${temporaryDirectory}`;

        if (packageManager === "yarn") {
            destination = `--out "${join(temporaryDirectory, "package.tgz")}"`;
        } else if (packageManager === "bun") {
            destination = ` --destination "${temporaryDirectory}"`;
        }

        let ignoreScripts = " --ignore-scripts";

        if (packageManager === "yarn") {
            ignoreScripts = "";
        } else if (packageManager === "pnpm") {
            ignoreScripts = " --config.ignore-scripts=true";
        }

        let { stdout } = await exec(`${packageManager} pack --json ${destination}${ignoreScripts}`, {
            cwd: context.options.rootDir,
            encoding: "utf8",
        });

        stdout = stdout.trim();

        if (packageManager === "pnpm") {
            stdout = fixPnpmStdout(stdout);
        } else if (packageManager === "yarn") {
            stdout = fixYarnStdout(stdout);
        }

        const parsed = JSON.parse(stdout) as
            | {
                filename: string;
                files: {
                    path: string;
                }[];
                name: string;
                version: string;
            }
            | undefined;

        if (!parsed?.filename) {
            throw new Error(`Invalid npm pack output format: ${stdout}`);
        }

        const tarballPath = parsed.filename;
        const tarball = await readFile(tarballPath);

        // eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
        const package_ = attwCore.createPackageFromTarballData(new Uint8Array(tarball));
        const analysis = await attwCore.checkPackage(package_, attwOptions);
        const ignoreResolutions = profiles[profile];

        if (analysis.types !== false && analysis.problems.length > 0) {
            const requiredResolutions = allResolutionKinds.filter((kind) => !ignoreResolutions.includes(kind));
            const ignoredResolutions = allResolutionKinds.filter((kind) => ignoreResolutions.includes(kind));
            const resolutions = [...requiredResolutions, ...ignoredResolutions];
            const entrypoints = Object.keys(analysis.entrypoints);

            const entrypointNames = entrypoints.map((s) => `"${s === "." ? analysis.packageName : `${analysis.packageName}/${s.slice(2)}`}"`);

            const entrypointHeaders = entrypoints.map((s, index) => {
                const hasProblems = analysis.problems.some((p) => problemAffectsEntrypoint(p, s, analysis));
                const color = hasProblems ? "redBright" : "greenBright";

                return bold[color](entrypointNames[index] as string);
            });

            const getCellContents = memo((subpath: string, resolutionKind: ResolutionKind) => {
                const ignoredPrefix = ignoreResolutions.includes(resolutionKind) ? "(ignored) " : "";
                const problemsForCell = groupProblemsByKind(filterProblems(analysis.problems, analysis, { entrypoint: subpath, resolutionKind }));
                const entrypoint = analysis.entrypoints[subpath].resolutions[resolutionKind];
                const { resolution } = entrypoint;
                const kinds = Object.keys(problemsForCell) as ProblemKind[];

                if (kinds.length > 0) {
                    return kinds.map((kind) => ignoredPrefix + problemKindColors[kind](problemKindInfo[kind].shortDescription)).join("\n");
                }

                const jsonResult = "OK (JSON)";
                const moduleResult = entrypoint.isWildcard
                    ? "(wildcard)"
                    : `OK ${
                        moduleKinds[analysis.programInfo[getResolutionOption(resolutionKind)].moduleKinds?.[resolution?.fileName ?? ""]?.detectedKind || ""]
                    }`;

                return ignoredPrefix + (resolution?.isJson ? jsonResult : moduleResult);
            });

            // Create matrix table (flipped format like ATTW CLI)
            const table = createTable({
                style: {
                    border: ROUNDED_BORDER,
                },
            });

            table.setHeaders(["", ...resolutions.map((kind) => resolutionKinds[kind])]);

            entrypointHeaders.forEach((entry, index) => {
                const [field, field2, field3, field4] = resolutions.map((kind) => entrypoints.map((entrypoint) => getCellContents(entrypoint, kind)));

                // eslint-disable-next-line unicorn/no-null
                table.addRow([entry, field[index] ?? null, field2[index] ?? null, field3[index] ?? null, field4[index] ?? null]);
            });

            const grouped = groupProblemsByKind(analysis.problems);
            const summaryTexts = Object.entries(grouped).map(([kind, kindProblems]) => {
                const info = problemKindInfo[kind as ProblemKind];
                const affectsRequiredResolution = kindProblems.some((p) => requiredResolutions.some((r) => problemAffectsResolutionKind(p, r, analysis)));
                const descriptionText = `${info.description}${info.details ? ` Use \`-f json\` to see ${info.details}.` : ""}`;
                const description = `${descriptionText} ${info.docsUrl}`;

                return `${affectsRequiredResolution ? "" : "(ignored per resolution) "}${problemKindColors[kind as ProblemKind](description)}`;
            });

            const problemMessage = `Are the types wrong problems found:\n\n${table.toString()}\n\n${summaryTexts.join("\n\n")}`;

            if (level === "error") {
                context.logger.error({
                    message: problemMessage,
                    prefix: "attw",
                });

                process.exitCode = 1;

                return;
            }

            context.logger.warn({
                message: problemMessage,
                prefix: "attw",
            });
        } else {
            context.logger.success({
                message: green(`No Are the types wrong problems found ${dim`(${Math.round(performance.now() - t).toString()}ms)`}`),
                prefix: "attw",
            });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        context.logger.error({
            message: `ATTW check failed: ${error.toString()}`,
            prefix: "attw",
        });
        context.logger.debug({
            message: "Found errors, setting exit code to 1",
            prefix: "attw",
        });

        process.exitCode = 1;
    } finally {
        await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => {});
    }
};

export default attw;
