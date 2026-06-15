import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import type { TsConfigJson } from "@visulima/tsconfig";
import { createDebug } from "obug";

const debug = createDebug("rollup-plugin-dts:tsgo");

interface GetExePathModule {
    default?: () => string;
}

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

export const getTsgoPathFromNodeModules = (): string => {
    const requireFromHere = createRequire(import.meta.url);
    // Use an absolute path to bypass the package exports field restriction
    const pkgJsonPath = requireFromHere.resolve("@typescript/native-preview/package.json");
    const pkgDirectory = path.dirname(pkgJsonPath);

    const loadedModule = requireFromHere(path.join(pkgDirectory, "lib", "getExePath.js")) as (() => string) | GetExePathModule;
    // Handle both CJS and ESM interop (ESM default exports become `mod.default` via CJS require)
    const getExePath: (() => string) | undefined = typeof loadedModule === "function" ? loadedModule : loadedModule.default;

    if (!getExePath) {
        throw new Error("Failed to resolve getExePath from @typescript/native-preview");
    }

    return getExePath();
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
): Promise<string> => {
    debug("[tsgo] rootDir", rootDirectory);

    let tsgo: string;

    if (tsgoPath) {
        tsgo = tsgoPath;
        debug("[tsgo] using custom path", tsgo);
    } else {
        tsgo = getTsgoPathFromNodeModules();
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

        temporaryProject = path.join(baseDirectory, `tsconfig.tsgo-${path.basename(tsgoDist)}.json`);

        const merged = tsconfig ? { compilerOptions, extends: tsconfig } : { ...rest, compilerOptions };

        await writeFile(temporaryProject, JSON.stringify(merged), "utf8");
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
