import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem build --jit", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should append plugins before and after a named plugin", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: `rollup: {
        plugins: [
            {
                before: "packem:esbuild",
                plugin: <Plugin>{
                    load() {
                        console.log("packem:test-plugin:before");
                    },
                    name: "packem:test-plugin:before"
                }
            },
            {
                after: "packem:esbuild",
                plugin: <Plugin>{
                    load() {
                        console.log("packem:test-plugin:after");
                    },
                    name: "packem:test-plugin:after"
                }
            }
        ],
}`,
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("packem:test-plugin:before");
        expect(binProcess.stdout).toContain("packem:test-plugin:after");
    });
});
