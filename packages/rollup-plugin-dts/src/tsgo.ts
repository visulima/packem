import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
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
 * TypeScript 7 ships the native (Go) compiler as the `typescript` package itself, so when
 * it is installed the `tsgo` binary comes from there rather than from the
 * `@typescript/native-preview` preview package.
 */
export const isTS70Installed = (): boolean => {
    try {
        const { versionMajorMinor } = createRequire(import.meta.url)("typescript") as { versionMajorMinor?: string };

        return versionMajorMinor === "7.0";
    } catch {
        return false;
    }
};

export const spawnAsync = async (...args: Parameters<typeof spawn>): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(...args);

        // Capture stderr when it isn't inherited so a non-zero exit can surface the cause.
        let stderr = "";

        child.stderr?.on("data", (chunk: Buffer | string) => {
            stderr += chunk.toString();
        });

        child.on("close", (code, signal) => {
            if (code === 0) {
                resolve();

                return;
            }

            const reason = code === null ? `was terminated by signal ${String(signal)}` : `exited with code ${String(code)}`;
            const details = `tsgo ${reason}${stderr.trim() ? `\n${stderr.trim()}` : ""}`;

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

    const requireFromHere = createRequire(import.meta.url);
    // TypeScript 7 is the native compiler itself, so `tsgo` lives in `typescript`. Older
    // TypeScript needs the separate `@typescript/native-preview` package.
    const packageName = isTS70Installed() ? "typescript" : "@typescript/native-preview";
    // Use an absolute path to bypass the package exports field restriction
    const pkgJsonPath = requireFromHere.resolve(`${packageName}/package.json`);
    const pkgDirectory = path.dirname(pkgJsonPath);
    const { version } = requireFromHere(pkgJsonPath) as { version: string };

    logger.info(`Emit types with ${styleText("underline", `${packageName}@${version}`)}`);

    const loadedModule = requireFromHere(path.join(pkgDirectory, "lib", "getExePath.js")) as (() => string) | GetExePathModule;
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
export const buildTsgoArgs = (project: string | undefined, tsgoDist: string, rootDirectory: string, sourcemap?: boolean): string[] => [
    "--noEmit",
    "false",
    "--declaration",
    "--emitDeclarationOnly",
    ...project ? ["-p", project] : [],
    "--outDir",
    tsgoDist,
    "--rootDir",
    rootDirectory,
    "--noCheck",
    ...sourcemap ? ["--declarationMap"] : [],
];

export const runTsgo = async (
    rootDirectory: string,
    tsconfig?: string,
    sourcemap?: boolean,
    tsgoPath?: string,
    tsconfigRaw?: TsConfigJson,
    logger: Logger = console,
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

    const args = buildTsgoArgs(project, tsgoDist, rootDirectory, sourcemap);

    debug("[tsgo] args %o", args);

    try {
        await spawnAsync(tsgo, args, { stdio: "inherit" });
    } finally {
        if (temporaryProject) {
            await rm(temporaryProject, { force: true }).catch(() => {});
        }
    }

    return tsgoDist;
};
