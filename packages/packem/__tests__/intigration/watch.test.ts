import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { writeFileSync } from "@visulima/fs";
import { execaNode } from "execa";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig } from "../helpers";

const distributionPath = join(
    // __tests__/intigration → __tests__ → dist
    // Reuse the same resolution strategy as exec-packem-sync helper
    fileURLToPath(new URL("../../dist", import.meta.url)),
);

describe("packem watch", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
        await createPackemConfig(temporaryDirectoryPath);

        await createPackageJson(temporaryDirectoryPath, {
            files: ["dist"],
            module: "dist/index.js",
            name: "pkg",
            type: "module",
        });

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const a = 1;\n`);
    });

    afterEach(async () => {
        // Cleanup handled by tempy and test runner; child process will be killed in test
    });

    it("should not crash when onSuccess runs and a rebuild is triggered", { timeout: 30_000 }, async () => {
        expect.assertions(2);

        // Start watch with a quick onSuccess command that prints a marker
        const proc = execaNode(
            join(distributionPath, "cli/index.js"),
            ["build", "--development", "--watch", "--onSuccess=node -e \"console.log('ON_SUCCESS_OK')\"", "--no-validation"],
            {
                cwd: temporaryDirectoryPath,
                reject: false,
            },
        );

        // Accumulate stdout to detect markers
        let stdout = "";

        proc.stdout?.on("data", (chunk) => {
            stdout += String(chunk);
        });

        // Wait for initial build completion and onSuccess marker
        const waitForFirstSuccess = async () => {
            const start = Date.now();

            while (Date.now() - start < 10_000) {
                if (
                    (stdout.includes("Rebuild finished") || stdout.includes("Build run in") || stdout.includes("Build succeeded"))
                    && stdout.includes("ON_SUCCESS_OK")
                ) {
                    return;
                }

                await sleep(100);
            }
            throw new Error("Timed out waiting for initial onSuccess");
        };

        await waitForFirstSuccess();

        // Trigger a change to invoke doOnSuccessCleanup and then another onSuccess run
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const a = 2;\n`);

        const waitForSecondSuccess = async () => {
            const start = Date.now();
            let count = 0;

            while (Date.now() - start < 10_000) {
                // Count occurrences of marker; need 2 (initial + rebuild)
                count = (stdout.match(/ON_SUCCESS_OK/g) ?? []).length;

                if (count >= 2) {
                    return;
                }

                await sleep(100);
            }
            throw new Error("Timed out waiting for second onSuccess after change");
        };

        await waitForSecondSuccess();

        // Stop the watcher
        proc.kill("SIGINT");
        const result = await proc; // resolved due to reject:false

        // Ensure we didn't hit the previous crash path
        expect(stdout).not.toContain("Cannot read properties of undefined (reading 'exitCode')");
        // Process terminated by our SIGINT is acceptable
        expect(result.signal === "SIGINT" || result.exitCode === 0).toBe(true);
    });
});
