import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execPath as processExecPath, versions as processVersions } from "node:process";

import { bold, cyan, dim, gray, green } from "@visulima/colorize";
import { isAccessible } from "@visulima/fs";
import { formatBytes } from "@visulima/humanizer";
import type { BuildContext } from "@visulima/packem-share/types";
import { basename, extname, join, relative, resolve } from "@visulima/path";
import { x } from "tinyexec";

import type { InternalBuildOptions } from "../types";
import { resolveAssets } from "./assets";
import { resolveChecksumAlgorithm, writeChecksum } from "./checksum";
import { createDebug } from "./debug";
import { resolveNodeBinary } from "./download";
import { buildFileName } from "./file-name";
import type { ExeChunk, ExeOptions, SeaConfig } from "./options";
import type { ResolvedExeTarget } from "./platform";
import { MIN_SEA_NODE_VERSION, resolveNodeVersion } from "./platform";
import { resolveSignOptions, signExecutable } from "./sign";
import { isHostTarget, resolveTargets } from "./target";
import { isAtLeast } from "./version";
import type { PackageMetadata } from "./windows-resources";
import { getPatchedBinaryPath, patchWindowsBinary } from "./windows-resources";

const debug = createDebug();

const DTS_REGEX = /\.d\.[mc]?ts$/;

type Logger = BuildContext<InternalBuildOptions>["logger"];

interface ExeBuildInput {
    buildEntries: ReadonlyArray<ExeChunk>;
    logger: Logger;
    options: InternalBuildOptions;
    packageJson: PackageMetadata;
}

type IncomingContext = {
    buildEntries: ReadonlyArray<unknown>;
    logger: unknown;
    options: InternalBuildOptions;
    pkg: PackageMetadata & { type?: string };
};

const toExeBuildInput = (context: IncomingContext): ExeBuildInput => {
    return {
        buildEntries: context.buildEntries as ReadonlyArray<ExeChunk>,
        logger: context.logger as Logger,
        options: context.options,
        packageJson: context.pkg,
    };
};

/**
 * Rejects build environments that cannot produce a single executable.
 *
 * `--build-sea` is a Node.js feature, so the host has to be a recent enough Node.js —
 * there is no Bun or Deno equivalent to fall back to.
 * @param input The normalized build input.
 * @throws If the runtime is Bun/Deno or the Node.js version predates stable SEA support.
 */
const validateSea = (input: ExeBuildInput): void => {
    const { logger, options } = input;

    if (processVersions.bun || processVersions.deno) {
        throw new Error("The `exe` option is not supported in Bun and Deno environments.");
    }

    if (!isAtLeast(processVersions.node, MIN_SEA_NODE_VERSION)) {
        throw new Error(`Node.js v${processVersions.node} does not support the \`exe\` option. Please upgrade to Node.js ${MIN_SEA_NODE_VERSION} or later.`);
    }

    if (options.declaration) {
        logger.warn(
            "Generating .d.ts files with the `exe` option is not recommended since they won't be included in the executable. Consider separating your library and executable targets if you need type declarations.",
        );
    }

    logger.info("`exe` option is experimental and may change in future releases.");
};

const pickMainFormat = (fileName: string, packageType: string | undefined): "commonjs" | "module" => {
    if (fileName.endsWith(".cjs")) {
        return "commonjs";
    }

    if (fileName.endsWith(".mjs")) {
        return "module";
    }

    return packageType === "module" ? "module" : "commonjs";
};

/**
 * Selects the build outputs that should become executables.
 *
 * Declaration files are always excluded. When `exe.entries` is set, only chunks whose
 * file name (with or without extension) matches one of the listed names are kept, which
 * is how a package with several `bin` entries builds a subset of them.
 * @param buildEntries Every chunk produced by the bundler.
 * @param names The configured `exe.entries` filter.
 * @returns The chunks to turn into executables.
 * @throws If the filter matches nothing, listing what was available.
 */
const selectEntryChunks = (buildEntries: ReadonlyArray<ExeChunk>, names: string[] | undefined): ExeChunk[] => {
    const entryChunks = buildEntries.filter((entry) => entry.type === "entry" && !DTS_REGEX.test(entry.path));

    if (entryChunks.length === 0) {
        throw new Error("The `exe` feature requires a built entry, but no entry chunks were found.");
    }

    if (names === undefined || names.length === 0) {
        return entryChunks;
    }

    const wanted = new Set(names);
    const selected = entryChunks.filter((entry) => {
        const fileName = basename(entry.path);

        return wanted.has(fileName) || wanted.has(basename(fileName, extname(fileName))) || wanted.has(entry.path);
    });

    if (selected.length === 0) {
        const available = entryChunks.map((entry) => `- ${entry.path}`).join("\n");

        throw new Error(`The \`exe.entries\` filter ${JSON.stringify(names)} matched none of the built entries:\n${available}`);
    }

    return selected;
};

interface BuildOneOptions {
    assets: Record<string, string>;
    /** Absolute path of the bundled JS entry that becomes the executable's main module. */
    bundledFile: string;
    chunk: ExeChunk;
    exe: ExeOptions;
    input: ExeBuildInput;
    /** Whether this build produces more than one executable, which affects default naming. */
    multiple: boolean;
    target: ResolvedExeTarget;
}

interface BuiltExecutable {
    checksum?: string;
    durationMs: number;
    path: string;
    signed: boolean;
    size: number;
}

/**
 * Builds one executable for one target.
 *
 * The order of operations matters: Windows resources are written into the base
 * `node.exe` *before* injection, while macOS signing happens *after* it, because
 * injection rewrites the binary and would invalidate an earlier signature.
 * @param options Everything needed for this single target/chunk combination.
 * @returns Details of the produced executable, for the build summary.
 */
const buildSingleExe = async (options: BuildOneOptions): Promise<BuiltExecutable> => {
    const { assets, bundledFile, chunk, exe, input, multiple, target } = options;
    const { logger, options: buildOptions, packageJson } = input;

    const exeOutDirectory = resolve(buildOptions.rootDir, exe.outDir ?? "build");

    await mkdir(exeOutDirectory, { recursive: true });

    const entryName = basename(bundledFile, extname(bundledFile));
    const tokens = {
        arch: target.arch,
        name: entryName,
        node: target.nodeVersion,
        platform: target.platform,
        version: packageJson.version ?? "",
    };
    const template = typeof exe.fileName === "function" ? exe.fileName({ ...tokens, path: chunk.path }) : exe.fileName;
    const outputFileName = buildFileName({ multiple, template, tokens });
    const outputPath = join(exeOutDirectory, outputFileName);

    debug("Building SEA executable: %s -> %s (%O)", bundledFile, outputPath, target);

    const started = performance.now();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "packem-sea-"));

    try {
        // A non-host target needs the matching official Node.js binary; the host can
        // reuse the running one and skip the download entirely.
        let executable = isHostTarget(target) ? undefined : await resolveNodeBinary(target, logger);

        if (target.platform === "win" && (exe.windows?.icon || exe.windows?.versionInfo)) {
            executable = await patchWindowsBinary({
                basePath: executable ?? processExecPath,
                outputFileName,
                packageJson,
                rootDir: buildOptions.rootDir,
                targetPath: getPatchedBinaryPath(temporaryDirectory),
                windows: exe.windows,
            });
        }

        const seaConfig: SeaConfig = {
            disableExperimentalSEAWarning: true,
            ...exe.seaConfig,
            ...(Object.keys(assets).length > 0 && { assets }),
            ...(exe.execArgv && { execArgv: exe.execArgv }),
            ...(exe.codeCache !== undefined && { useCodeCache: exe.codeCache }),
            ...(exe.snapshot !== undefined && { useSnapshot: exe.snapshot }),
            main: bundledFile,
            mainFormat: pickMainFormat(chunk.path, packageJson.type),
            output: outputPath,
            ...(executable && { executable }),
        };

        const seaConfigPath = join(temporaryDirectory, "sea-config.json");

        await writeFile(seaConfigPath, JSON.stringify(seaConfig));
        debug("Wrote sea-config.json: %O -> %s", seaConfig, seaConfigPath);

        debug("Running: %s --build-sea %s", processExecPath, seaConfigPath);
        await x(processExecPath, ["--build-sea", seaConfigPath], {
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

    const signOptions = resolveSignOptions(exe.macos?.sign);
    const signed =
        signOptions !== undefined
        && (await signExecutable({ logger, outputPath, rootDir: buildOptions.rootDir, sign: signOptions, targetPlatform: target.platform }));

    const stats = (await isAccessible(outputPath)) ? await stat(outputPath) : undefined;
    const algorithm = resolveChecksumAlgorithm(exe.checksum);
    const written = algorithm === undefined ? undefined : await writeChecksum(outputPath, algorithm);

    return {
        checksum: written?.digest,
        durationMs: Math.round(performance.now() - started),
        path: outputPath,
        signed,
        size: stats?.size ?? 0,
    };
};

/**
 * Prints one line per produced executable, plus a total.
 * @param built The executables produced by this build.
 * @param logger The build logger.
 * @param rootDir The project root that the reported paths are made relative to.
 */
const reportBuiltExecutables = (built: ReadonlyArray<BuiltExecutable>, logger: Logger, rootDir: string): void => {
    for (const executable of built) {
        const details = [formatBytes(executable.size, { decimals: 2 }), `${String(executable.durationMs)}ms`];

        if (executable.signed) {
            details.push("signed");
        }

        if (executable.checksum) {
            details.push(`${executable.checksum.slice(0, 12)}…`);
        }

        logger.info(`${bold(green(relative(rootDir, executable.path)))} ${dim(details.join(" · "))}`);
    }

    const totalMs = built.reduce((total, item) => total + item.durationMs, 0);

    logger.success(`Built ${cyan(String(built.length))} executable${built.length === 1 ? "" : "s"} ${gray(`(${String(totalMs)}ms)`)}`);
};

/**
 * Builds every configured executable for a finished bundle.
 *
 * Runs after the bundler has written its output, once per entry chunk per target.
 * Builds are sequential on purpose: each one spawns `node --build-sea` and, for
 * cross-targets, may download a Node.js binary, so running them in parallel mostly
 * competes for the same disk and network.
 * @param context The packem build context.
 * @throws If the environment cannot build executables, or any individual build fails.
 */
const buildExe = async (context: unknown): Promise<void> => {
    const input = toExeBuildInput(context as IncomingContext);
    const { buildEntries, logger, options } = input;
    const exeOption = options.exe;

    if (!exeOption) {
        return;
    }

    const exe: ExeOptions = typeof exeOption === "object" ? exeOption : {};

    validateSea(input);

    const chunks = selectEntryChunks(buildEntries, exe.entries);

    // Resolve every target up front so a typo in `targets` fails before the first
    // (potentially very slow) download or build. With no `targets`, build for the host.
    const requestedTargets = resolveTargets(exe.targets ?? ["host"], exe.nodeVersion);
    const targets: ResolvedExeTarget[] = await Promise.all(
        requestedTargets.map(async (target) => {
            return { ...target, nodeVersion: await resolveNodeVersion(target.nodeVersion) };
        }),
    );

    if (exe.seaConfig?.executable && exe.targets !== undefined && exe.targets.length > 0) {
        logger.warn("`seaConfig.executable` is ignored when `targets` is specified.");
    }

    const { map: assets, totalBytes: assetBytes } = await resolveAssets(exe.assets, options.rootDir);
    const assetCount = Object.keys(assets).length;

    if (assetCount > 0) {
        logger.info(`Embedding ${String(assetCount)} asset${assetCount === 1 ? "" : "s"} ${dim(`(${formatBytes(assetBytes, { decimals: 2 })})`)}`);
    }

    // Only several targets force a suffix: distinct entries already have distinct names.
    const multiple = targets.length > 1;
    const built: BuiltExecutable[] = [];

    for (const chunk of chunks) {
        const bundledFile = join(options.rootDir, options.outDir, chunk.path);

        for (const target of targets) {
            // eslint-disable-next-line no-await-in-loop -- each build spawns `node --build-sea` and may download a runtime; running them concurrently only contends for disk and network.
            built.push(await buildSingleExe({ assets, bundledFile, chunk, exe, input, multiple, target }));
        }
    }

    reportBuiltExecutables(built, logger, options.rootDir);
};

export { buildExe, selectEntryChunks, validateSea };
