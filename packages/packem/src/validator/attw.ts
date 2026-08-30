import child_process from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import type { Analysis, CheckResult, ProblemKind, ResolutionKind } from "@arethetypeswrong/core";
import { blue, bold, dim, green, red, yellow } from "@visulima/colorize";
import type { NormalizedPackageJson } from "@visulima/package";
import { ensurePackages } from "@visulima/package";
import type { BuildContext } from "@visulima/packem-share/types";
import { basename, isAbsolute, join } from "@visulima/path";
import { createTable } from "@visulima/tabular";
import { ROUNDED_BORDER } from "@visulima/tabular/style";

import loadPackageJson from "../config/utils/load-package-json";
import type { AttwOptions, InternalBuildOptions } from "../types";

/**
 * Minimal structural view of the Pail logger.
 *
 * `@visulima/pail`'s `dist/index.server.d.ts` re-exports `Pail` from a
 * non-existent `./pail.d.ts` (the real file is `./pail.server.d.ts`), so the
 * upstream `Pail` type used by `BuildContext.logger` resolves to an error type
 * and every `context.logger.*` access trips `no-unsafe-*`. Until the upstream
 * package fixes its re-export, narrow the logger to the methods used here; the
 * runtime object implements them.
 */
interface LogPayload {
    message: string;
    prefix: string;
}

interface Logger {
    debug: (payload: LogPayload) => void;
    error: (payload: LogPayload) => void;
    raw: (message: string) => void;
    success: (payload: LogPayload) => void;
    warn: (payload: LogPayload) => void;
}

const getLogger = (context: BuildContext<InternalBuildOptions>): Logger => context.logger as Logger;

const PNPM_JSON_START_REGEX = /\{\s*"name"/;

const exec = promisify(child_process.exec);

// Sentinel thrown after we've already logged the formatted problem table;
// the outer catch skips its generic "ATTW check failed" line for this kind.
class AttwReportedError extends Error {}

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
const fixPnpmStdout = (stdout: string): string => {
    // If starts with `{`, it's likely a valid JSON
    if (stdout.startsWith("{")) {
        return stdout;
    }

    // Otherwise try to find its usual output format, `{\n  "name": ...`
    const usualStartIndex = PNPM_JSON_START_REGEX.exec(stdout)?.index;

    if (usualStartIndex !== undefined) {
        return stdout.slice(usualStartIndex);
    }

    // Otherwise, simply try to find the first `{` character
    const firstBraceIndex = stdout.indexOf("{");

    if (firstBraceIndex !== -1) {
        return stdout.slice(firstBraceIndex);
    }

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
        if (line) {
            fixedStdout += `${line},`;
        }
    }

    // Remove trailing slash
    if (fixedStdout.at(-1) === ",") {
        fixedStdout = fixedStdout.slice(0, -1);
    }

    fixedStdout += "]";

    return fixedStdout;
};

/**
 * End.
 */

const resolvePackageManager = async (pm: string, rootDirectory: string): Promise<string | undefined> => {
    switch (pm) {
        case "auto": {
            const { detect } = await import("package-manager-detector/detect");

            const dpm = await detect({ cwd: rootDirectory });

            if (!dpm) {
                return undefined;
            }

            if (dpm.name === "bun") {
                throw new Error("Bun does not support --json on the pack command");
            }

            return dpm.name;
        }
        case "bun": {
            throw new Error("Bun does not support --json on the pack command");
        }
        case "pnpm": {
            return "pnpm";
        }
        case "yarn": {
            return "yarn";
        }
        default: {
            return "npm";
        }
    }
};

type AttwUtils = typeof import("@arethetypeswrong/core/utils");
type AttwProblems = typeof import("@arethetypeswrong/core/problems");

interface ProblemMessageDependencies {
    allResolutionKinds: AttwUtils["allResolutionKinds"];
    filterProblems: AttwProblems["filterProblems"];
    getResolutionOption: AttwUtils["getResolutionOption"];
    // eslint-disable-next-line no-secrets/no-secrets -- @arethetypeswrong/core API name, not a secret.
    groupProblemsByKind: AttwUtils["groupProblemsByKind"];
    problemAffectsEntrypoint: AttwProblems["problemAffectsEntrypoint"];
    // eslint-disable-next-line no-secrets/no-secrets -- @arethetypeswrong/core API name, not a secret.
    problemAffectsResolutionKind: AttwProblems["problemAffectsResolutionKind"];
    problemKindInfo: AttwProblems["problemKindInfo"];
}

const buildProblemMessage = (analysis: Analysis, ignoreResolutions: string[], dependencies: ProblemMessageDependencies): string => {
    const {
        allResolutionKinds,
        filterProblems,
        getResolutionOption,
        groupProblemsByKind,
        problemAffectsEntrypoint,
        problemAffectsResolutionKind,
        problemKindInfo,
    } = dependencies;

    const requiredResolutions = allResolutionKinds.filter((kind) => !ignoreResolutions.includes(kind));
    const ignoredResolutions = allResolutionKinds.filter((kind) => ignoreResolutions.includes(kind));
    const resolutions = [...requiredResolutions, ...ignoredResolutions];
    const entrypoints = Object.keys(analysis.entrypoints);

    const entrypointNames = entrypoints.map((s) => `"${s === "." ? analysis.packageName : `${analysis.packageName}/${s.slice(2)}`}"`);

    const entrypointHeaders = entrypoints.map((s, index) => {
        const hasProblems = analysis.problems.some((p) => problemAffectsEntrypoint(p, s, analysis));
        const color = hasProblems ? "redBright" : "greenBright";

        return bold[color](entrypointNames[index]);
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
        const detectedKind = analysis.programInfo[getResolutionOption(resolutionKind)].moduleKinds?.[resolution?.fileName ?? ""]?.detectedKind;
        const moduleKindKey = detectedKind ?? "";
        const moduleResult = entrypoint.isWildcard ? "(wildcard)" : `OK ${moduleKinds[moduleKindKey]}`;

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
        const isAffectsRequiredResolution = kindProblems.some((p) => requiredResolutions.some((r) => problemAffectsResolutionKind(p, r, analysis)));
        const descriptionText = `${info.description}${info.details ? ` Use \`-f json\` to see ${info.details}.` : ""}`;
        const description = `${descriptionText} ${info.docsUrl}`;

        return `${isAffectsRequiredResolution ? "" : "(ignored per resolution) "}${problemKindColors[kind as ProblemKind](description)}`;
    });

    return `Are the types wrong problems found:\n\n${table.toString()}\n\n${summaryTexts.join("\n\n")}`;
};

interface PackResult {
    filename: string;
    files?: {
        path: string;
    }[];
    name?: string;
    version?: string;
}

/**
 * Extracts the tarball filename from `&lt;pm> pack --json` stdout.
 *
 * npm and yarn emit a JSON **array** of pack results (yarn after
 * {@link fixYarnStdout} normalisation), where `filename` is only a basename.
 * pnpm emits a single JSON **object** with an absolute `filename`. Handle both
 * shapes by unwrapping the first element of an array.
 * @param stdout Already package-manager-normalised JSON string.
 * @returns The reported tarball filename (basename for npm/yarn, absolute for pnpm).
 */
const parsePackFilename = (stdout: string): string => {
    const parsed = JSON.parse(stdout) as PackResult | PackResult[] | undefined;

    const result = Array.isArray(parsed) ? parsed[0] : parsed;

    if (!result?.filename) {
        throw new Error(`Invalid npm pack output format: ${stdout}`);
    }

    return result.filename;
};

const packPackage = async (packageManager: string, temporaryDirectory: string, rootDirectory: string): Promise<string> => {
    let destination = `--pack-destination "${temporaryDirectory}"`;

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

    const result = await exec(`${packageManager} pack --json ${destination}${ignoreScripts}`, {
        cwd: rootDirectory,
        encoding: "utf8",
    });

    let stdout = result.stdout.trim();

    if (packageManager === "pnpm") {
        stdout = fixPnpmStdout(stdout);
    } else if (packageManager === "yarn") {
        stdout = fixYarnStdout(stdout);
    }

    const filename = parsePackFilename(stdout);

    // npm and yarn report only the tarball's basename (relative to the
    // `--pack-destination`/`--out` directory), while pnpm reports an absolute
    // path. Resolve the basename against the temp dir; trust an absolute path
    // as-is.
    return isAbsolute(filename) ? filename : join(temporaryDirectory, basename(filename));
};

const reportAnalysis = (
    logger: Logger,
    analysis: CheckResult,
    ignoreResolutions: string[],
    level: string,
    startedAt: number,
    dependencies: ProblemMessageDependencies,
): void => {
    if (analysis.types !== false && analysis.problems.length > 0) {
        const problemMessage = buildProblemMessage(analysis, ignoreResolutions, dependencies);

        if (level === "error") {
            logger.error({
                message: problemMessage,
                prefix: "attw",
            });

            // Throwing lets the CLI wrapper translate to a non-zero exit
            // code. Mutating process.exitCode here poisons embedded/test
            // callers that share the parent process. The error already
            // surfaced via logger.error above, so we throw a sentinel
            // the outer catch skips to avoid double-logging.
            throw new AttwReportedError("attw reported types problems; see the log above.");
        }

        logger.warn({
            message: problemMessage,
            prefix: "attw",
        });

        return;
    }

    logger.success({
        message: green(`No Are the types wrong problems found ${dim`(${Math.round(performance.now() - startedAt).toString()}ms)`}`),
        prefix: "attw",
    });
};

const attw = async (context: BuildContext<InternalBuildOptions>, logged: boolean): Promise<void> => {
    // `context` is built by the pipeline, but embedded/test callers may pass a
    // partial object; keep the defensive optional chain.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard for partial embedded contexts; see comment above.
    if (!context.options?.validation) {
        return;
    }

    const { validation } = context.options;

    if (!validation.attw) {
        return;
    }

    const logger = getLogger(context);

    // loadPackageJson throws when package.json is missing, so a subsequent
    // "not found" check would be dead code.
    const { packageJson } = loadPackageJson(context.options.rootDir);

    context.pkg = packageJson;

    if (logged) {
        logger.raw("\n");
    }

    await ensurePackages(context.pkg as NormalizedPackageJson, ["@arethetypeswrong/core", "package-manager-detector"], "devDependencies", {
        logger: {
            warn: (message: string) => {
                logger.warn({
                    message,
                    prefix: "attw",
                });
            },
        },
    });

    // eslint-disable-next-line prefer-const
    let { level = "warn", pm = "auto", profile = "strict", ...attwOptions } = validation.attw === true ? {} : validation.attw;

    const t = performance.now();

    logger.debug({
        message: "Running attw check",
        prefix: "attw",
    });

    const temporaryDirectory = await mkdtemp(join(tmpdir(), "packem-attw-"));

    const cleanupTemporaryDirectory = async (): Promise<void> => {
        await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => {});
    };

    let attwCore: typeof import("@arethetypeswrong/core");

    try {
        attwCore = await import("@arethetypeswrong/core");
    } catch {
        logger.error({
            message: `ATTW check requires ${blue`@arethetypeswrong/core`} to be installed.`,
            prefix: "attw",
        });

        await cleanupTemporaryDirectory();

        return;
    }

    let packageManager: string | undefined;

    try {
        packageManager = await resolvePackageManager(pm, context.options.rootDir);
    } catch (error) {
        await cleanupTemporaryDirectory();

        throw error;
    }

    if (packageManager === undefined) {
        await cleanupTemporaryDirectory();

        throw new Error("Could not detect a package manager to run the attw check.");
    }

    const { allResolutionKinds, getResolutionOption, groupProblemsByKind } = await import("@arethetypeswrong/core/utils");
    const { filterProblems, problemAffectsEntrypoint, problemAffectsResolutionKind, problemKindInfo } = await import("@arethetypeswrong/core/problems");

    try {
        const tarballPath = await packPackage(packageManager, temporaryDirectory, context.options.rootDir);
        const tarball = await readFile(tarballPath);

        // eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
        const package_ = attwCore.createPackageFromTarballData(new Uint8Array(tarball));
        const analysis = await attwCore.checkPackage(package_, attwOptions);
        const ignoreResolutions = profiles[profile];

        reportAnalysis(logger, analysis, ignoreResolutions, level, t, {
            allResolutionKinds,
            filterProblems,
            getResolutionOption,
            groupProblemsByKind,
            problemAffectsEntrypoint,
            problemAffectsResolutionKind,
            problemKindInfo,
        });
    } catch (error: unknown) {
        if (!(error instanceof AttwReportedError)) {
            logger.error({
                message: `ATTW check failed: ${error instanceof Error ? error.message : String(error)}`,
                prefix: "attw",
            });
        }

        throw error;
    } finally {
        await cleanupTemporaryDirectory();
    }
};

export { parsePackFilename };
export default attw;
