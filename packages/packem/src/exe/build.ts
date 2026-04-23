import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { platform as processPlatform, versions as processVersions } from "node:process";

import { bold, dim, gray, red } from "@visulima/colorize";
import { isAccessible } from "@visulima/fs";
import { formatBytes } from "@visulima/humanizer";
import { basename, extname, join, relative, resolve } from "@visulima/path";
import satisfies from "semver/functions/satisfies.js";
import { x } from "tinyexec";

import type { InternalBuildOptions } from "../types";
import { createDebug } from "./debug";
import { resolveNodeBinary } from "./download";
import type { ExeExtensionOptions } from "./platform";
import { getTargetSuffix } from "./platform";

const debug = createDebug();

const DTS_REGEX = /\.d\.[mc]?ts$/;

interface Logger {
    info: (message: string) => void;
    success: (message: string) => void;
    warn: (message: string) => void;
}

interface ExeChunk {
    path: string;
    type?: string;
}

interface ExeBuildInput {
    buildEntries: ReadonlyArray<ExeChunk>;
    logger: Logger;
    options: InternalBuildOptions;
    packageType: string | undefined;
}

type IncomingContext = {
    buildEntries: ReadonlyArray<unknown>;
    logger: unknown;
    options: InternalBuildOptions;
    pkg: { type?: string };
};

interface SeaConfig {
    /** Optional, embedded asset mappings. */
    assets?: Record<string, string>;
    /** @default true */
    disableExperimentalSEAWarning?: boolean;
    /** Extra Node.js CLI arguments embedded into the executable. */
    execArgv?: string[];
    /** @default "env" */
    execArgvExtension?: "cli" | "env" | "none";
    /** Optional; if not specified, uses the current Node.js binary. */
    executable?: string;
    main?: string;
    mainFormat?: "commonjs" | "module";
    output?: string;
    /** @default false */
    useCodeCache?: boolean;
    /** @default false */
    useSnapshot?: boolean;
}

interface ExeOptions extends ExeExtensionOptions {
    /**
     * Output file name without any suffix or extension.
     * For example, do not include `.exe`, platform suffixes, or architecture suffixes.
     */
    fileName?: ((chunk: ExeChunk) => string) | string;

    /**
     * Output directory for executables.
     * @default "build"
     */
    outDir?: string;

    /**
     * Node.js SEA configuration passthrough.
     * @see https://nodejs.org/api/single-executable-applications.html#generating-single-executable-applications-with---build-sea
     */
    seaConfig?: Omit<SeaConfig, "main" | "mainFormat" | "output">;
}

const toExeBuildInput = (context: IncomingContext): ExeBuildInput => {
    return {
        buildEntries: context.buildEntries as ReadonlyArray<ExeChunk>,
        logger: context.logger as Logger,
        options: context.options,
        packageType: context.pkg.type,
    };
};

const validateSea = (input: ExeBuildInput): void => {
    const { logger, options } = input;

    if (processVersions.bun || processVersions.deno) {
        throw new Error("The `exe` option is not supported in Bun and Deno environments.");
    }

    if (!satisfies(process.version, ">=25.7.0")) {
        throw new Error(
            `Node.js ${process.version} does not support \`exe\` option. Please upgrade to Node.js 25.7.0 or later.`,
        );
    }

    if (options.entries.length > 1) {
        const entryList = options.entries.map((entry) => `- ${entry.input}`).join("\n");

        throw new Error(
            `The \`exe\` feature only supports a single entry point. Found ${String(options.entries.length)} entries:\n${entryList}`,
        );
    }

    if (options.declaration) {
        logger.warn(
            "Generating .d.ts files with the `exe` option is not recommended since they won't be included in the executable. Consider separating your library and executable targets if you need type declarations.",
        );
    }

    logger.info("`exe` option is experimental and may change in future releases.");
};

const pickMainFormat = (
    fileName: string,
    packageType: string | undefined,
): "commonjs" | "module" => {
    if (fileName.endsWith(".cjs")) {
        return "commonjs";
    }

    if (fileName.endsWith(".mjs")) {
        return "module";
    }

    return packageType === "module" ? "module" : "commonjs";
};

const HOST_TARGET_PLATFORM: string = processPlatform === "win32" ? "win" : processPlatform;

const resolveOutputFileName = (
    exe: ExeOptions,
    chunk: ExeChunk,
    bundledFile: string,
    targetPlatform: string,
    suffix?: string,
): string => {
    let baseName: string;

    if (exe.fileName) {
        baseName = typeof exe.fileName === "function" ? exe.fileName(chunk) : exe.fileName;
    } else {
        baseName = basename(bundledFile, extname(bundledFile));
    }

    if (suffix) {
        baseName += suffix;
    }

    if (targetPlatform === "win") {
        baseName += ".exe";
    }

    return baseName;
};

const buildSingleExe = async (
    input: ExeBuildInput,
    exe: ExeOptions,
    chunk: ExeChunk,
    bundledFile: string,
    outputFile: string,
    targetPlatform: string,
    executable?: string,
): Promise<void> => {
    const { logger, options, packageType } = input;
    const exeOutDirectory = resolve(options.rootDir, exe.outDir ?? "build");

    await mkdir(exeOutDirectory, { recursive: true });

    const outputPath = join(exeOutDirectory, outputFile);

    debug("Building SEA executable: %s -> %s", bundledFile, outputPath);

    const started = performance.now();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "packem-sea-"));

    try {
        const seaConfig: SeaConfig = {
            disableExperimentalSEAWarning: true,
            ...exe.seaConfig,
            main: bundledFile,
            mainFormat: pickMainFormat(chunk.path, packageType),
            output: outputPath,
        };

        if (executable) {
            seaConfig.executable = executable;
        }

        const seaConfigPath = join(temporaryDirectory, "sea-config.json");

        await writeFile(seaConfigPath, JSON.stringify(seaConfig));
        debug("Wrote sea-config.json: %O -> %s", seaConfig, seaConfigPath);

        debug("Running: %s --build-sea %s", process.execPath, seaConfigPath);
        await x(process.execPath, ["--build-sea", seaConfigPath], {
            nodeOptions: { stdio: ["ignore", "ignore", "inherit"] },
            throwOnError: true,
        });
    } finally {
        if (debug.enabled) {
            debug("Preserving temp directory for debugging: %s", temporaryDirectory);
        } else {
            await rm(temporaryDirectory, { force: true, recursive: true });
        }
    }

    if (targetPlatform === "darwin") {
        try {
            await x("codesign", ["--sign", "-", outputPath], {
                nodeOptions: { stdio: "inherit" },
                throwOnError: true,
            });
        } catch {
            const signHint = processPlatform === "darwin"
                ? `You can sign it manually using:\n  codesign --sign - "${outputPath}"`
                : `Automatic code signing is not supported on ${processPlatform}.`;

            logger.warn(`Failed to code-sign the executable. ${signHint}`);
        }
    }

    if (await isAccessible(outputPath)) {
        const awaitedStat = await stat(outputPath);
        const sizeText = formatBytes(awaitedStat.size, { decimals: 2 });

        logger.info(`${bold(relative(options.rootDir, outputPath))} ${dim(sizeText)}`);
    }

    const durationMs = Math.round(performance.now() - started);

    logger.success(
        `Built executable: ${red(relative(options.rootDir, outputPath))} ${gray(`(${String(durationMs)}ms)`)}`,
    );
};

const buildExe = async (context: unknown): Promise<void> => {
    const input = toExeBuildInput(context as IncomingContext);
    const { buildEntries, logger, options } = input;
    const exeOption = options.exe;

    if (!exeOption) {
        return;
    }

    const exe: ExeOptions = typeof exeOption === "object" ? exeOption : {};

    validateSea(input);

    const entryChunks = buildEntries.filter(
        (entry): entry is ExeChunk => entry.type === "entry" && !DTS_REGEX.test(entry.path),
    );

    if (entryChunks.length === 0) {
        throw new Error("The `exe` feature requires a built entry, but no entry chunks were found.");
    }

    if (entryChunks.length > 1) {
        const chunkList = entryChunks.map((entry) => `- ${entry.path}`).join("\n");

        throw new Error(
            `The \`exe\` feature only supports single-chunk outputs. Found ${String(entryChunks.length)} chunks:\n${chunkList}`,
        );
    }

    const chunk: ExeChunk = entryChunks[0];
    const bundledFile = join(options.rootDir, options.outDir, chunk.path);

    debug("Building executable with SEA for chunk: %s", chunk.path);

    const { targets } = exe;

    if (targets !== undefined && targets.length > 0) {
        // `seaConfig` is declared optional on `ExeOptions`; with `strictNullChecks: false`
        // ESLint strips the `| undefined`, which makes the required guard look redundant.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (exe.seaConfig?.executable) {
            logger.warn("`seaConfig.executable` is ignored when `targets` is specified.");
        }

        for (const target of targets) {
            // eslint-disable-next-line no-await-in-loop
            const nodeBinaryPath = await resolveNodeBinary(target, logger as never);
            const suffix = getTargetSuffix(target);
            const outputFile = resolveOutputFileName(exe, chunk, bundledFile, target.platform, suffix);

            // eslint-disable-next-line no-await-in-loop
            await buildSingleExe(input, exe, chunk, bundledFile, outputFile, target.platform, nodeBinaryPath);
        }
    } else {
        const outputFile = resolveOutputFileName(exe, chunk, bundledFile, HOST_TARGET_PLATFORM);

        await buildSingleExe(input, exe, chunk, bundledFile, outputFile, HOST_TARGET_PLATFORM);
    }
};

export type { ExeOptions, SeaConfig };
export { buildExe, validateSea };
