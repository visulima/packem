import type { StdioOptions } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { styleText } from "node:util";

import type { TsConfigJson } from "@visulima/tsconfig";
import { writeTsConfig } from "@visulima/tsconfig";
import { createDebug } from "obug";

import type { Logger } from "./options";

const debug = createDebug("rollup-plugin-dts:tsgo");

interface GetExePathModule {
    default?: () => string;
}

// Resolving the binary shells out to the package's `getExePath`, so memoize it per process.
let tsgoPathCache: string | undefined;

/**
 * Resolve modules from the project being built first, then from this package. A bundler
 * that is installed globally, hoisted elsewhere, or run from a monorepo's `dist/` would
 * otherwise see its own `typescript` instead of the one the project declares.
 */
const createProjectRequire = (): { require: (id: string) => unknown; resolve: (id: string) => string } => {
    const fromProject = createRequire(path.join(process.cwd(), "package.json"));
    const fromHere = createRequire(import.meta.url);

    return {
        require: (id) => {
            try {
                return fromProject(id) as unknown;
            } catch {
                return fromHere(id) as unknown;
            }
        },
        resolve: (id) => {
            try {
                return fromProject.resolve(id);
            } catch {
                return fromHere.resolve(id);
            }
        },
    };
};

/**
 * TypeScript 7+ ships the native (Go) compiler as the `typescript` package itself, so when
 * it is installed the `tsgo` binary comes from there rather than from the
 * `@typescript/native-preview` preview package.
 */
export const isTS70Installed = (): boolean => {
    try {
        const { versionMajorMinor } = createProjectRequire().require("typescript") as { versionMajorMinor?: string };

        return Number.parseInt(versionMajorMinor ?? "", 10) >= 7;
    } catch {
        return false;
    }
};

export const spawnAsync = async (...args: Parameters<typeof spawn>): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(...args);

        // Capture stdout and stderr when they aren't inherited so a non-zero exit can surface the
        // cause. tsgo prints type diagnostics on stdout, so both streams are needed. stdout must be
        // drained even when unused, or a piped child can block on a full pipe.
        let output = "";

        child.stdout?.on("data", (chunk: Buffer | string) => {
            output += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer | string) => {
            output += chunk.toString();
        });

        child.on("close", (code, signal) => {
            if (code === 0) {
                resolve();

                return;
            }

            const reason = code === null ? `was terminated by signal ${String(signal)}` : `exited with code ${String(code)}`;
            const details = `tsgo ${reason}${output.trim() ? `\n${output.trim()}` : ""}`;

            reject(new Error(details));
        });
        child.on("error", (error) => {
            reject(error);
        });
    });
};

export const getTsgoPathFromNodeModules = (logger: Logger = console): string => {
    if (tsgoPathCache) {
        return tsgoPathCache;
    }

    const projectRequire = createProjectRequire();
    // TypeScript 7 is the native compiler itself, so `tsgo` lives in `typescript`. Older
    // TypeScript needs the separate `@typescript/native-preview` package.
    const packageName = isTS70Installed() ? "typescript" : "@typescript/native-preview";
    // Use an absolute path to bypass the package exports field restriction
    const pkgJsonPath = projectRequire.resolve(`${packageName}/package.json`);
    const pkgDirectory = path.dirname(pkgJsonPath);
    const { version } = projectRequire.require(pkgJsonPath) as { version: string };

    logger.info(`Emit types with ${styleText("underline", `${packageName}@${version}`)}`);

    const loadedModule = projectRequire.require(path.join(pkgDirectory, "lib", "getExePath.js")) as (() => string) | GetExePathModule;
    // Handle both CJS and ESM interop (ESM default exports become `mod.default` via CJS require)
    const getExePath: (() => string) | undefined = typeof loadedModule === "function" ? loadedModule : loadedModule.default;

    if (!getExePath) {
        throw new Error(`Failed to resolve getExePath from ${packageName}`);
    }

    tsgoPathCache = getExePath();

    return tsgoPathCache;
};

/**
 * Build the argument list for the `tsgo` binary.
 *
 * Kept as a pure function so the flag wiring can be unit-tested without spawning a process.
 */
export const buildTsgoArgs = (
    project: string | undefined,
    tsgoDist: string,
    rootDirectory: string,
    sourcemap?: boolean,
    check = false,
    runExternalCode = false,
): string[] => [
    "--noEmit",
    "false",
    "--declaration",
    "--emitDeclarationOnly",
    ...(project ? ["-p", project] : []),
    "--outDir",
    tsgoDist,
    "--rootDir",
    rootDirectory,
    ...(check ? [] : ["--noCheck"]),
    ...(sourcemap ? ["--declarationMap"] : []),
    // Content mappers from tsconfig run as external processes; tsgo refuses them without this flag.
    ...(runExternalCode ? ["--runExternalCode"] : []),
];

export const getTsgoEmitRoot = (rootDirectory: string): string => path.parse(rootDirectory).root;

export const runTsgo = async (
    rootDirectory: string,
    tsconfig?: string,
    sourcemap?: boolean,
    tsgoPath?: string,
    tsconfigRaw?: TsConfigJson,
    logger: Logger = console,
    check = false,
    runExternalCode = false,
): Promise<string> => {
    debug("[tsgo] rootDir", rootDirectory);

    let tsgo: string;

    if (tsgoPath) {
        tsgo = tsgoPath;
        debug("[tsgo] using custom path", tsgo);
    } else {
        tsgo = getTsgoPathFromNodeModules(logger);
        debug("[tsgo] using tsgo from node_modules", tsgo);
    }

    const tsgoDist = await mkdtemp(path.join(tmpdir(), "rollup-plugin-dts-"));

    debug("[tsgo] tsgoDist", tsgoDist);

    // tsgo reads `compilerOptions` solely from the project file passed via `-p`, so
    // plugin-level `compilerOptions` / `tsconfigRaw` overrides were previously ignored.
    // Honor them by writing a temporary project that `extends` the user's tsconfig and
    // overlays the merged options. The temp file lives next to the original config so any
    // relative `baseUrl` / `paths` / `include` inherited from the base resolve identically.
    // See sxzz/rolldown-plugin-dts#238.
    let project = tsconfig;
    let temporaryProject: string | undefined;

    if (tsconfigRaw && Object.keys(tsconfigRaw.compilerOptions ?? {}).length > 0) {
        const baseDirectory = tsconfig ? path.dirname(tsconfig) : rootDirectory;
        const { compilerOptions, ...rest } = tsconfigRaw;

        const temporaryFileName = `tsconfig.tsgo-${path.basename(tsgoDist)}.json`;

        temporaryProject = path.join(baseDirectory, temporaryFileName);

        const merged = tsconfig ? { compilerOptions, extends: tsconfig } : { ...rest, compilerOptions };

        // `writeTsConfig` normalizes the resolved `compilerOptions` into a shape the tsgo JSON
        // project parser accepts: numeric enum values (e.g. `target: 99`, `moduleResolution: 100`,
        // which the classic backends consume directly) become their string names, and
        // `typescriptMajor: 7` drops options TS7 removed (e.g. `baseUrl`). Without this tsgo fails
        // with `TS5024: … requires a value of type enum` / `TS5102: Option 'baseUrl' has been removed`.
        await writeTsConfig(merged, { cwd: baseDirectory, fileName: temporaryFileName, typescriptMajor: 7 });
        debug("[tsgo] wrote temp project %s", temporaryProject);
        project = temporaryProject;
    }

    // Root the emit at the filesystem root so every declaration lands in the temp outDir: with a
    // narrower rootDir tsgo writes files outside it (e.g. workspace packages resolved to their
    // sources) next to those sources. `getTsgoEmitRoot` is shared with the reader in generate.ts.
    const args = buildTsgoArgs(project, tsgoDist, getTsgoEmitRoot(rootDirectory), sourcemap, check, runExternalCode);

    debug("[tsgo] args %o", args);

    // With `check`, stdio is piped so the diagnostics tsgo prints can be folded into the build
    // error. Without it, stdio stays inherited, as before.
    const stdio: StdioOptions = check ? ["ignore", "pipe", "pipe"] : "inherit";

    try {
        await spawnAsync(tsgo, args, { stdio });
    } catch (error) {
        // the caller never receives the directory on failure, so nothing else would remove it
        await rm(tsgoDist, { force: true, recursive: true }).catch(() => {});

        throw error;
    } finally {
        if (temporaryProject) {
            await rm(temporaryProject, { force: true }).catch(() => {});
        }
    }

    return tsgoDist;
};
