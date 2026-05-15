import { chmod, rm } from "node:fs/promises";
import process from "node:process";

import { isAccessible, writeFileSync } from "@visulima/fs";
// eslint-disable-next-line e18e/ban-dependencies -- execa is core test-runner infra for spawning the built executable; tinyexec migration tracked separately
import { execa } from "execa";
import satisfies from "semver/functions/satisfies.js";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

const SEA_SUPPORTED = !process.versions.bun && !process.versions.deno && satisfies(process.version, ">=25.7.0");

const EXE_UNSUPPORTED_REGEX = /does not support `exe` option/;

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
        expect.assertions(2);

        skip(SEA_SUPPORTED, "Skipping negative test on a SEA-supported runtime");

        writeFileSync(`${temporaryDirectoryPath}/src/cli.ts`, "console.log(\"hello from packem exe\");\n");

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
        expect(`${String(result.stdout)}\n${String(result.stderr)}`).toMatch(EXE_UNSUPPORTED_REGEX);
    });

    it.skipIf(!SEA_SUPPORTED)(
        "builds a runnable standalone executable on Node >= 25.7.0",
        async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/cli.ts`, "console.log(\"hello from packem exe\");\n");

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

            await expect(isAccessible(binaryPath)).resolves.toBe(true);

            // eslint-disable-next-line vitest/no-conditional-in-test -- deterministic platform branch for required setup (chmod the binary on POSIX), not a flaky conditional assertion
            if (process.platform !== "win32") {
                await chmod(binaryPath, 0o755);
            }

            const run = await execa(binaryPath, [], { reject: false });

            expect(run.stdout).toContain("hello from packem exe");
        },
        120_000,
    );
});
