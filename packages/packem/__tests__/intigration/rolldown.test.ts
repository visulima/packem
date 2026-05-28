import { rm } from "node:fs/promises";

import { writeFile } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";

// The "missing rolldown" path is only exercised when neither '@rolldown/node' nor
// 'rolldown' resolves from packem's own node_modules. Once rolldown is installed
// (e.g. as a devDep so the full integration suite can run against it), the helpful
// error becomes unreachable, so skip rather than asserting an obsolete failure.
const isRolldownInstalled = await (async (): Promise<boolean> => {
    try {
        const rolldownNodeSpecifier = "@rolldown/node";

        await import(rolldownNodeSpecifier);

        return true;
    } catch {
        /* not installed */
    }

    try {
        await import("rolldown");

        return true;
    } catch {
        /* not installed */
    }

    return false;
})();

describe("bundler: rolldown", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory({ prefix: "packem-rolldown" });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.runIf(!isRolldownInstalled)("should print a helpful error when rolldown is not installed", async () => {
        expect.assertions(2);

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export const foo = 1;`);
        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
            },
            types: "./dist/index.d.ts",
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                bundler: "rolldown",
            },
            transformer: "esbuild",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(1);

        const combined = `${String(binProcess.stderr)}\n${String(binProcess.stdout)}`;

        expect(combined).toContain("Rolldown is not installed. Please install '@rolldown/node'");
    });
});
