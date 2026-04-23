import { chmod, rm } from "node:fs/promises";
import process from "node:process";

import { isAccessible, writeFileSync } from "@visulima/fs";
import { execa } from "execa";
import satisfies from "semver/functions/satisfies.js";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

const SEA_SUPPORTED = !process.versions.bun && !process.versions.deno && satisfies(process.version, ">=25.7.0");

describe("packem exe (SEA)", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("fails with a clear error when Node version is below 25.7.0", async ({ skip }) => {
        if (SEA_SUPPORTED) {
            skip("Skipping negative test on a SEA-supported runtime");
        }

        expect.assertions(2);

        writeFileSync(
            `${temporaryDirectoryPath}/src/cli.ts`,
            "console.log(\"hello from packem exe\");\n",
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            main: "./dist/cli.cjs",
        });
        await createTsConfig(temporaryDirectoryPath);

        const result = await execPackem("build", ["--exe"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(result.exitCode).not.toBe(0);
        expect(`${result.stdout}\n${result.stderr}`).toMatch(/does not support `exe` option/);
    });

    it.skipIf(!SEA_SUPPORTED)(
        "builds a runnable standalone executable on Node >= 25.7.0",
        async () => {
            expect.assertions(3);

            writeFileSync(
                `${temporaryDirectoryPath}/src/cli.ts`,
                "console.log(\"hello from packem exe\");\n",
            );

            await installPackage(temporaryDirectoryPath, "typescript");

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: { typescript: "*" },
                main: "./dist/cli.cjs",
            });
            await createTsConfig(temporaryDirectoryPath);

            const result = await execPackem("build", ["--exe"], {
                cwd: temporaryDirectoryPath,
            });

            expect(result.exitCode).toBe(0);

            const binaryName = process.platform === "win32" ? "cli.exe" : "cli";
            const binaryPath = `${temporaryDirectoryPath}/build/${binaryName}`;

            expect(await isAccessible(binaryPath)).toBe(true);

            if (process.platform !== "win32") {
                await chmod(binaryPath, 0o755);
            }

            const run = await execa(binaryPath, [], { reject: false });

            expect(run.stdout).toContain("hello from packem exe");
        },
        120_000,
    );
});
