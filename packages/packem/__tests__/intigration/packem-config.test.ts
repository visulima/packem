import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem config", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should append plugins based on enforce to pre/post and normal if enforce is undefined", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: `rollup: {
        plugins: [
            {
                enforce: "pre",
                plugin: {
                    load() {
                        console.log("packem:test-plugin:pre");
                    },
                    name: "packem:test-plugin:before"
                }
            },
            {
                plugin: {
                    load() {
                        console.log("packem:test-plugin:normal");
                    },
                    name: "packem:test-plugin:before"
                }
            },
            {
                enforce: "post",
                plugin: {
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

        expect(binProcess.stdout).toContain("packem:test-plugin:pre");
        expect(binProcess.stdout).toContain("packem:test-plugin:normal");
        expect(binProcess.stdout).toContain("packem:test-plugin:after");
    });
});
