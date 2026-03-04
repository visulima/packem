import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDebug } from "obug";

const debug = createDebug("rollup-plugin-dts:tsgo");

const spawnAsync = (...args: Parameters<typeof spawn>) =>
    new Promise<void>((resolve, reject) => {
        const child = spawn(...args);

        child.on("close", () => resolve());
        child.on("error", (error) => reject(error));
    });

export const getTsgoPathFromNodeModules = (): string => {
    const _require = createRequire(import.meta.url);
    // Use an absolute path to bypass the package exports field restriction
    const pkgJsonPath = _require.resolve("@typescript/native-preview/package.json");
    const pkgDir = path.dirname(pkgJsonPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const module_ = _require(path.join(pkgDir, "lib", "getExePath.js")) as any;
    // Handle both CJS and ESM interop (ESM default exports become `mod.default` via CJS require)
    const getExePath: () => string = typeof module_ === "function" ? module_ : module_.default;

    return getExePath();
};

export const runTsgo = async (rootDir: string, tsconfig?: string, sourcemap?: boolean, tsgoPath?: string): Promise<string> => {
    debug("[tsgo] rootDir", rootDir);

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
        rootDir,
        "--noCheck",
        ...sourcemap ? ["--declarationMap"] : [],
    ];

    debug("[tsgo] args %o", args);

    await spawnAsync(tsgo, args, { stdio: "inherit" });

    return tsgoDist;
};
