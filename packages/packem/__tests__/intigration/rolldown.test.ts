import { rm } from "node:fs/promises";

import { writeFile } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("bundler: rolldown", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory({ prefix: "packem-rolldown" });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should print a helpful error when rolldown is not installed", async () => {
        expect.assertions(2);

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export const foo = 1;`);
        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
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
            devDependencies: {
                typescript: "*",
            },
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
        const combined = `${binProcess.stderr}\n${binProcess.stdout}`;
        expect(combined).toContain("Rolldown is not installed. Please install '@rolldown/node'");
    });
});


