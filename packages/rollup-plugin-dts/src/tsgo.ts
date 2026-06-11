import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDebug } from "obug";

const debug = createDebug("rollup-plugin-dts:tsgo");

interface GetExePathModule {
    default?: () => string;
}

export const spawnAsync = async (...args: Parameters<typeof spawn>): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(...args);

        child.on("close", (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`tsgo exited with ${signal ? `signal ${signal}` : `code ${String(code)}`}`));
            }
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

export const runTsgo = async (rootDirectory: string, tsconfig?: string, sourcemap?: boolean, tsgoPath?: string): Promise<string> => {
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

    const args = [
        "--noEmit",
        "false",
        "--declaration",
        "--emitDeclarationOnly",
        ...tsconfig ? ["-p", tsconfig] : [],
        "--outDir",
        tsgoDist,
        "--rootDir",
        rootDirectory,
        "--noCheck",
        ...sourcemap ? ["--declarationMap"] : [],
    ];

    debug("[tsgo] args %o", args);

    await spawnAsync(tsgo, args, { stdio: "inherit" });

    return tsgoDist;
};
