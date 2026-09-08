import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
import { assertBytecodeSupported, compileBytecode, createLoaderSource, getCompilerBinary } from "./bytecode";
import { resolveChecksumAlgorithm, writeChecksum } from "./checksum";
import type { CompressionAlgorithm, SeaManifest } from "./compress";
import { BYTECODE_ASSET_KEY, compressBuffer, MANIFEST_ASSET_KEY, resolveCompression } from "./compress";
import { createDebug } from "./debug";
import { resolveNodeBinary } from "./download";
import { buildFileName } from "./file-name";
import type { NativeModule } from "./native-modules";
import { assertNativeModulesSupported, computeNativeBuildId, createNativePreludeSource, findNativeModules } from "./native-modules";
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
        throw new Error(`Node.js v${processVersions.node} does not support \`exe\` option. Please upgrade to Node.js ${MIN_SEA_NODE_VERSION} or later.`);
    }

    if (options.declaration) {
        logger.warn(
            "Generating .d.ts files with the `exe` option is not recommended since they won't be included in the executable. Consider separating your library and executable targets if you need type declarations.",
        );
    }

    logger.info("`exe` option is experimental and may change in future releases.");
};

/**
 * Reads the subdirectory the `native-modules` plugin copies `.node` files into.
 * @param options The resolved build options.
 * @returns The configured directory name, defaulting to `natives`.
 */
const getNativesDirectory = (options: InternalBuildOptions): string => {
    const nativeModules = (options as { rollup?: { nativeModules?: false | { nativesDirectory?: string } } }).rollup?.nativeModules;

    return (nativeModules === false ? undefined : nativeModules?.nativesDirectory) ?? "natives";
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
    /** Algorithm applied to the embedded payload, or `undefined` to embed it verbatim. */
    compression: CompressionAlgorithm | undefined;
    exe: ExeOptions;
    input: ExeBuildInput;
    /** Native addons found in the build output, to embed and materialize at runtime. */
    natives: NativeModule[];
    /** File name this executable is written under, resolved and collision-checked up front. */
    outputFileName: string;
    target: ResolvedExeTarget;
}

/**
 * Rewrites an embedded asset map so every entry points at a compressed copy, and adds the
 * manifest the runtime reads to know how to decode them.
 *
 * The compressed copies live in the build's scratch directory: the project's own files are
 * never touched, and the executable is the only thing that carries compressed bytes.
 * @param sourceAssets The original key to source-path map.
 * @param compression The algorithm to apply.
 * @param temporaryDirectory Scratch directory for the compressed copies.
 * @returns Entries pointing at the compressed copies, plus the manifest entry.
 */
const compressEmbeddedAssets = async (
    sourceAssets: Record<string, string>,
    compression: CompressionAlgorithm,
    temporaryDirectory: string,
): Promise<Record<string, string>> => {
    const assetsDirectory = join(temporaryDirectory, "assets");

    await mkdir(assetsDirectory, { recursive: true });

    const entries = Object.entries(sourceAssets);

    const compressed = await Promise.all(
        entries.map(async ([key, sourcePath], index) => {
            const bytes = await compressBuffer(await readFile(sourcePath), compression);
            // Index-based names keep the scratch layout flat and collision-free, whatever
            // the asset keys look like.
            const compressedPath = join(assetsDirectory, `asset-${String(index)}.bin`);

            await writeFile(compressedPath, bytes);

            return [key, compressedPath] as const;
        }),
    );

    const manifest: SeaManifest = { compression };
    const manifestPath = join(temporaryDirectory, "manifest.json");

    await writeFile(manifestPath, JSON.stringify(manifest));

    debug("Compressed %d assets with %s", entries.length, compression);

    return { ...Object.fromEntries(compressed), [MANIFEST_ASSET_KEY]: manifestPath };
};

interface OutputNameOptions {
    chunk: ExeChunk;
    exe: ExeOptions;
    /** Whether several targets are built, which decides whether a suffix is added. */
    multiple: boolean;
    packageVersion: string;
    target: ResolvedExeTarget;
}

/**
 * Resolves the file name one executable is written under.
 *
 * Pure, so the whole build's names can be computed up front and checked for collisions
 * before anything slow happens.
 * @param options The chunk, target and naming configuration for this executable.
 * @returns The final file name, including any extension.
 */
const resolveOutputFileName = (options: OutputNameOptions): string => {
    const { chunk, exe, multiple, packageVersion, target } = options;
    const tokens = {
        arch: target.arch,
        name: basename(chunk.path, extname(chunk.path)),
        node: target.nodeVersion,
        platform: target.platform,
        version: packageVersion,
    };
    const template = typeof exe.fileName === "function" ? exe.fileName({ ...tokens, path: chunk.path }) : exe.fileName;

    return buildFileName({ multiple, template, tokens });
};

/**
 * Finds the native addons to embed, and reports what will happen to them.
 * @param exe The resolved `exe` options.
 * @param options The build options, which say where the output and its natives directory are.
 * @param logger The build logger.
 * @returns The addons to embed, empty when embedding is disabled or none were produced.
 */
const collectNativeModules = async (exe: ExeOptions, options: InternalBuildOptions, logger: Logger): Promise<NativeModule[]> => {
    if (exe.nativeModules === false) {
        logger.warn("`exe.nativeModules` is disabled: any `.node` addon has to be shipped next to the executable, which is no longer a single file.");

        return [];
    }

    const natives = await findNativeModules(join(options.rootDir, options.outDir), getNativesDirectory(options));

    if (natives.length > 0) {
        logger.info(`Embedding ${String(natives.length)} native addon${natives.length === 1 ? "" : "s"}: ${natives.map((native) => native.name).join(", ")}`);
    }

    return natives;
};

interface NativePreludeApplication {
    bundledFile: string;
    compression: CompressionAlgorithm | undefined;
    mainFormat: "commonjs" | "module";
    natives: NativeModule[];
    temporaryDirectory: string;
}

/**
 * Writes a copy of the bundle prefixed with the native-addon prelude.
 *
 * Returns the original path untouched when there are no addons, so a build without them
 * embeds exactly the bundle the bundler produced.
 * @param options The bundle, the addons, and a scratch directory.
 * @returns Path of the entry to embed, prefixed when addons are present.
 */
const applyNativePrelude = async (options: NativePreludeApplication): Promise<string> => {
    const { bundledFile, compression, mainFormat, natives, temporaryDirectory } = options;

    if (natives.length === 0) {
        return bundledFile;
    }

    const prelude = createNativePreludeSource({
        buildId: await computeNativeBuildId(natives),
        compression,
        mainFormat,
        modules: natives,
    });
    const entryPath = join(temporaryDirectory, `entry${extname(bundledFile)}`);

    await writeFile(entryPath, `${prelude}\n${await readFile(bundledFile, "utf8")}`);

    debug("Prefixed the entry with a prelude for %d native addon(s)", natives.length);

    return entryPath;
};

/**
 * Maps each native addon to the file that gets embedded for it.
 *
 * Addons are compressed like any other payload when compression is on; the prelude
 * decompresses each one as it writes it out.
 * @param natives The addons found in the build output.
 * @param compression The algorithm to apply, or `undefined` to embed them verbatim.
 * @param temporaryDirectory Scratch directory for the compressed copies.
 * @returns Asset key to source-path entries, ready to merge into the SEA asset map.
 */
const buildNativeAssetMap = async (
    natives: ReadonlyArray<NativeModule>,
    compression: CompressionAlgorithm | undefined,
    temporaryDirectory: string,
): Promise<Record<string, string>> => {
    if (natives.length === 0) {
        return {};
    }

    if (compression === undefined) {
        return Object.fromEntries(natives.map((native) => [native.assetKey, native.filePath]));
    }

    const nativesDirectory = join(temporaryDirectory, "natives");

    await mkdir(nativesDirectory, { recursive: true });

    const entries = await Promise.all(
        natives.map(async (native) => {
            const compressedPath = join(nativesDirectory, `${native.name}.bin`);

            await writeFile(compressedPath, await compressBuffer(await readFile(native.filePath), compression));

            return [native.assetKey, compressedPath] as const;
        }),
    );

    return Object.fromEntries(entries);
};

interface BytecodePayloadOptions {
    bundledFile: string;
    chunk: ExeChunk;
    compression: CompressionAlgorithm | undefined;
    logger: Logger;
    mainFormat: "commonjs" | "module";
    /** Node.js binary that must produce the cache — the target's own build. */
    nodePath: string;
    target: ResolvedExeTarget;
    temporaryDirectory: string;
}

interface BytecodePayload {
    /** Loader that becomes the executable's main script in place of the bundle. */
    loaderPath: string;
    /** The embedded code cache, compressed when compression is enabled. */
    payloadPath: string;
}

/**
 * Compiles the entry to a V8 code cache and writes the loader that runs it.
 *
 * The bundle's source is left behind entirely: only the cache is embedded, and the loader
 * reconstructs the script from it at startup.
 * @param options The entry, target, and scratch directory for this executable.
 * @returns Paths of the loader and of the embedded cache.
 * @throws If the target or entry format cannot support bytecode, or compilation fails.
 */
const buildBytecodePayload = async (options: BytecodePayloadOptions): Promise<BytecodePayload> => {
    const { bundledFile, chunk, compression, logger, mainFormat, nodePath, target, temporaryDirectory } = options;

    assertBytecodeSupported(target, mainFormat);

    const compiled = await compileBytecode({ compression, entryPath: bundledFile, nodePath, temporaryDirectory });
    const payload = compression === undefined ? compiled.cachedData : await compressBuffer(compiled.cachedData, compression);

    const payloadPath = join(temporaryDirectory, "bytecode.bin");
    const loaderPath = join(temporaryDirectory, "bytecode-loader.cjs");

    await Promise.all([writeFile(payloadPath, payload), writeFile(loaderPath, createLoaderSource(compiled.sourceLength, basename(chunk.path), compression))]);

    logger.info(
        `Compiled ${bold(chunk.path)} to bytecode ${dim(`(${formatBytes(compiled.sourceBytes, { decimals: 2 })} source -> ${formatBytes(payload.length, { decimals: 2 })} cache)`)}`,
    );

    return { loaderPath, payloadPath };
};

interface SeaConfigOptions {
    embeddedAssets: Record<string, string>;
    exe: ExeOptions;
    /** Base binary to inject into, or `undefined` to use the running Node.js. */
    executable: string | undefined;
    mainFormat: "commonjs" | "module";
    mainPath: string;
    outputPath: string;
}

/**
 * Assembles the configuration handed to `node --build-sea`.
 *
 * `seaConfig` is spread first so the dedicated options take precedence over the raw
 * passthrough, and `main`/`output` are fixed by packem rather than the user.
 * @param options The resolved inputs for this executable.
 * @returns The SEA configuration to serialize.
 */
const createSeaConfig = (options: SeaConfigOptions): SeaConfig => {
    const { embeddedAssets, exe, executable, mainFormat, mainPath, outputPath } = options;

    return {
        disableExperimentalSEAWarning: true,
        ...exe.seaConfig,
        ...(Object.keys(embeddedAssets).length > 0 && { assets: embeddedAssets }),
        ...(exe.execArgv && { execArgv: exe.execArgv }),
        ...(exe.codeCache !== undefined && { useCodeCache: exe.codeCache }),
        ...(exe.snapshot !== undefined && { useSnapshot: exe.snapshot }),
        main: mainPath,
        // The bytecode loader is always CommonJS, whatever the bundle it replaces was.
        mainFormat: exe.bytecode ? "commonjs" : mainFormat,
        output: outputPath,
        ...(executable && { executable }),
    };
};

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
    const { assets, bundledFile, chunk, compression, exe, input, natives, outputFileName, target } = options;
    const { logger, options: buildOptions, packageJson } = input;

    const exeOutDirectory = resolve(buildOptions.rootDir, exe.outDir ?? "build");

    await mkdir(exeOutDirectory, { recursive: true });

    const outputPath = join(exeOutDirectory, outputFileName);

    debug("Building SEA executable: %s -> %s (%O)", bundledFile, outputPath, target);

    const started = performance.now();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "packem-sea-"));

    try {
        // A non-host target needs the matching official Node.js binary; the host can
        // reuse the running one and skip the download entirely.
        let executable = isHostTarget(target) ? undefined : await resolveNodeBinary(target, logger);

        const mainFormat = pickMainFormat(chunk.path, packageJson.type);
        // A native addon has to exist as a real file for the dynamic linker, so the entry
        // is prefixed with code that writes the embedded copies out on first use. This has
        // to happen before bytecode compilation, so the prelude is compiled along with it.
        const entryPath = await applyNativePrelude({ bundledFile, compression, mainFormat, natives, temporaryDirectory });
        assertNativeModulesSupported(natives, isHostTarget(target));

        const bytecode = exe.bytecode
            ? await buildBytecodePayload({
                  // `entryPath`, not `bundledFile`: when both options are on, the bytecode
                  // loader replaces the main script, so a prelude left out here would never
                  // run and `.node` requires would fail at the first call.
                  bundledFile: entryPath,
                  chunk,
                  compression,
                  logger,
                  mainFormat,
                  nodePath: getCompilerBinary(target, executable),
                  target,
                  temporaryDirectory,
              })
            : undefined;

        const embeddedAssets: Record<string, string> = {
            ...(compression === undefined ? assets : await compressEmbeddedAssets(assets, compression, temporaryDirectory)),
            ...(bytecode && { [BYTECODE_ASSET_KEY]: bytecode.payloadPath }),
            ...(await buildNativeAssetMap(natives, compression, temporaryDirectory)),
        };
        // The bundle itself is the main script, unless bytecode replaced it with a loader.
        const mainPath = bytecode?.loaderPath ?? entryPath;

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

        const seaConfig = createSeaConfig({ embeddedAssets, exe, executable, mainFormat, mainPath, outputPath });

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

interface PlannedOutput {
    chunk: ExeChunk;
    outputFileName: string;
    target: ResolvedExeTarget;
}

/**
 * Works out what every executable will be called, and refuses plans that collide.
 *
 * Names are resolved before anything slow runs, because two outputs sharing a name means
 * the second silently overwrites the first — the build would report two executables while
 * one file exists. A token-free `exe.fileName`, or a `fileName` function that ignores the
 * chunk, both produce that, as do two targets that differ only by Node.js version.
 * @param chunks The entry chunks to build.
 * @param targets The resolved targets.
 * @param exe The resolved `exe` options.
 * @param packageVersion The `version` field of package.json, for the `[version]` token.
 * @returns One entry per executable to build.
 * @throws If two executables would be written to the same file, naming what collided.
 */
const planOutputs = (chunks: ReadonlyArray<ExeChunk>, targets: ReadonlyArray<ResolvedExeTarget>, exe: ExeOptions, packageVersion: string): PlannedOutput[] => {
    // Only several targets force the default suffix: distinct entries already differ by
    // `[name]`, so a single-target multi-entry build keeps its plain names.
    const multiple = targets.length > 1;
    const plan: PlannedOutput[] = [];
    const seen = new Map<string, PlannedOutput>();

    for (const chunk of chunks) {
        for (const target of targets) {
            const outputFileName = resolveOutputFileName({ chunk, exe, multiple, packageVersion, target });
            const clash = seen.get(outputFileName);

            if (clash) {
                throw new Error(
                    `Two executables would both be written to "${outputFileName}":\n`
                        + `- ${clash.chunk.path} for ${clash.target.platform}-${clash.target.arch} (Node.js ${clash.target.nodeVersion})\n`
                        + `- ${chunk.path} for ${target.platform}-${target.arch} (Node.js ${target.nodeVersion})\n`
                        + 'Give `exe.fileName` a template that tells them apart, such as "[name]-[platform]-[arch]-node[node]".',
                );
            }

            seen.set(outputFileName, { chunk, outputFileName, target });
            plan.push({ chunk, outputFileName, target });
        }
    }

    return plan;
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

    const compression = resolveCompression(exe.compress);

    if (exe.bytecode && exe.snapshot) {
        throw new Error(
            "`exe.bytecode` and `exe.snapshot` cannot be combined: a startup snapshot needs the entry's source, which bytecode mode does not ship.",
        );
    }

    const natives = await collectNativeModules(exe, options, logger);

    const { map: assets, totalBytes: assetBytes } = await resolveAssets(exe.assets, options.rootDir);
    const assetCount = Object.keys(assets).length;

    if (assetCount > 0) {
        logger.info(`Embedding ${String(assetCount)} asset${assetCount === 1 ? "" : "s"} ${dim(`(${formatBytes(assetBytes, { decimals: 2 })})`)}`);
    }

    const plan = planOutputs(chunks, targets, exe, input.packageJson.version ?? "");
    const built: BuiltExecutable[] = [];

    for (const { chunk, outputFileName, target } of plan) {
        const bundledFile = join(options.rootDir, options.outDir, chunk.path);

        // eslint-disable-next-line no-await-in-loop -- each build spawns `node --build-sea` and may download a runtime; running them concurrently only contends for disk and network.
        built.push(await buildSingleExe({ assets, bundledFile, chunk, compression, exe, input, natives, outputFileName, target }));
    }

    reportBuiltExecutables(built, logger, options.rootDir);
};

export { buildExe, planOutputs, resolveOutputFileName, selectEntryChunks, validateSea };
