import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem package.json imports", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.each(["esbuild", "swc", "sucrase"] as ("esbuild" | "swc" | "sucrase")[])(
        "should resolve package.json imports with a * and %s transformer",
        async (transformer) => {
            expect.assertions(5);

            writeFileSync(`${temporaryDirectoryPath}/src/x.ts`, `export const x = 2;`);
            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export * as warns from '#x.ts';`);

            await installPackage(temporaryDirectoryPath, "typescript");

            await createPackageJson(
                temporaryDirectoryPath,
                {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        ".": {
                            import: "./dist/index.mjs",
                            require: "./dist/index.cjs",
                        },
                    },
                    imports: {
                        "#*": "./src/*",
                    },
                },
                transformer,
            );
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath, {
                transformer,
            });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).not.toContain("If this is incorrect, add it to the");

            const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjsContent).toMatchSnapshot("cjs output");

            const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjsContent).toMatchSnapshot("mjs output");
        },
    );
});
