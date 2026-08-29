import { mkdirSync, renameSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";

describe("packem build cache", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should rebuild after a module moves from a file to a directory with an index", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/hash.ts`, `export const hash = () => "first-shape";`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { hash } from "./hash";

export const value = hash();`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        // Warm the cache.
        let binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.exitCode).toBe(0);
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toContain("first-shape");

        // `src/hash.ts` becomes `src/hash/index.ts`. The importer keeps saying "./hash"
        // and its source never changes, so the cached resolution stays keyed the same
        // while the file it names is gone.
        mkdirSync(`${temporaryDirectoryPath}/src/hash`);
        renameSync(`${temporaryDirectoryPath}/src/hash.ts`, `${temporaryDirectoryPath}/src/hash/index.ts`);
        writeFileSync(`${temporaryDirectoryPath}/src/hash/index.ts`, `export const hash = () => "second-shape";`);

        binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).not.toContain("Could not load");
        expect(binProcess.exitCode).toBe(0);

        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toContain("second-shape");
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toContain("second-shape");
        // Two full builds plus a package install run well past the 15s default under CI load.
    }, 60_000);
});
