import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { readFileSync, writeFileSync } from "@visulima/fs";
// eslint-disable-next-line e18e/ban-dependencies -- execa is core test-runner infra for spawning the watch process; tinyexec migration tracked separately
import { execaNode } from "execa";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig } from "../helpers";

const distributionPath = join(
    // __tests__/intigration → __tests__ → dist
    // Reuse the same resolution strategy as exec-packem-sync helper
    fileURLToPath(new URL("../../dist", import.meta.url)),
);

const ON_SUCCESS_OK_REGEX = /ON_SUCCESS_OK/g;

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
            ["build", "--development", "--watch", "--onSuccess=echo ON_SUCCESS_OK", "--no-validation"],
            {
                cwd: temporaryDirectoryPath,
                reject: false,
            },
        );

        // Accumulate stdout to detect markers
        let stdout = "";

        proc.stdout.on("data", (chunk) => {
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

                // eslint-disable-next-line no-await-in-loop -- intentional sequential poll: must wait between stdout checks for the build markers
                await sleep(100);
            }
            throw new Error("Timed out waiting for initial onSuccess");
        };

        await waitForFirstSuccess();

        // Trigger a change to invoke doOnSuccessCleanup and then another onSuccess run
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const a = 2;\n`);

        const waitForSecondSuccess = async () => {
            const start = Date.now();

            while (Date.now() - start < 10_000) {
                // Count occurrences of marker; need 2 (initial + rebuild)
                const count = (stdout.match(ON_SUCCESS_OK_REGEX) ?? []).length;

                if (count >= 2) {
                    return;
                }

                // eslint-disable-next-line no-await-in-loop -- intentional sequential poll: must wait between stdout checks until the marker count reaches 2
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

    it("should rebuild with new entry points when package.json changes", { timeout: 30_000 }, async () => {
        expect.assertions(3);

        // Start with a single entry
        writeFileSync(`${temporaryDirectoryPath}/src/utils.js`, `export const b = 2;\n`);

        const proc = execaNode(join(distributionPath, "cli/index.js"), ["build", "--development", "--watch", "--no-validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        let stdout = "";

        proc.stdout.on("data", (chunk) => {
            stdout += String(chunk);
        });

        // Wait for initial build
        const waitFor = async (pattern: string, timeoutMs = 15_000) => {
            const start = Date.now();

            while (Date.now() - start < timeoutMs) {
                if (stdout.includes(pattern)) {
                    return;
                }

                // eslint-disable-next-line no-await-in-loop -- intentional sequential poll: must wait between stdout checks until the pattern appears
                await sleep(100);
            }

            throw new Error(`Timed out waiting for: ${pattern}\nstdout so far:\n${stdout}`);
        };

        await waitFor("Rebuild finished");

        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);

        // Update package.json with a new entry point
        stdout = ""; // Reset to detect new messages

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.js",
                },
                "./utils": {
                    import: "./dist/utils.js",
                },
            },
            files: ["dist"],
            name: "pkg",
            type: "module",
        });

        // Wait for the restart message and rebuild
        await waitFor("package.json changed");
        await waitFor("Rebuild finished");

        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);

        const utilsContent = readFileSync(`${temporaryDirectoryPath}/dist/utils.js`);

        expect(utilsContent).toContain("2");

        proc.kill("SIGINT");
        await proc;
    });

    it("should keep emitting CSS across watch rebuilds when the cache is enabled", { timeout: 60_000 }, async () => {
        expect.assertions(7);

        // Override the beforeEach config with CSS-enabled config (postcss, extract mode)
        await createPackemConfig(temporaryDirectoryPath, {
            cssLoader: ["postcss"],
            cssOptions: { mode: "extract" },
        });

        // Write a JS entry that imports CSS
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `import "./style.css";\nexport const a = 1;\n`);
        writeFileSync(`${temporaryDirectoryPath}/src/style.css`, `.a { color: red; }\n`);

        const proc = execaNode(join(distributionPath, "cli/index.js"), ["build", "--development", "--watch", "--no-validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        let stdout = "";

        proc.stdout.on("data", (chunk: Buffer) => {
            stdout += String(chunk);
        });

        proc.stderr.on("data", (chunk: Buffer) => {
            stdout += String(chunk);
        });

        // "Rebuild finished" appears exactly once per complete build cycle (END event).
        // Use it as the single marker to count completed builds.
        const waitForRebuild = async (nthOccurrence: number, timeoutMs = 20_000): Promise<void> => {
            const start = Date.now();

            while (Date.now() - start < timeoutMs) {
                const matches = stdout.match(/Rebuild finished/g);
                const count = matches?.length ?? 0;

                if (count >= nthOccurrence) {
                    return;
                }

                // eslint-disable-next-line no-await-in-loop -- intentional sequential poll
                await sleep(100);
            }

            throw new Error(`Timed out waiting for rebuild #${String(nthOccurrence)}\nstdout so far:\n${stdout}`);
        };

        // Wait for the initial build
        await waitForRebuild(1);

        // Assert: CSS artifact exists and contains `color: red`
        const cssPath = `${temporaryDirectoryPath}/dist/index.css`;

        expect(existsSync(cssPath)).toBe(true);
        expect(readFileSync(cssPath)).toContain("color: red");

        // Delete the CSS file, then trigger a JS-only change.
        // With the bug: the CSS module is cached (unchanged) → transform() is
        // skipped → `extracted` Map stays empty → generateBundle emits nothing →
        // the deleted CSS file is NOT re-created.
        // With the fix: moduleParsed fires for the cached CSS module, repopulates
        // `extracted` from the stored meta → generateBundle re-emits the CSS file.
        rmSync(cssPath);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `import "./style.css";\nexport const a = 2;\n`);

        await waitForRebuild(2);

        // Regression: with the bug, cached CSS modules skipped transform and the
        // extracted Map was empty → generateBundle emitted nothing → CSS not re-created.
        expect(existsSync(cssPath)).toBe(true);
        expect(readFileSync(cssPath)).toContain("color: red");

        // Trigger a CSS change so we confirm live updates still work
        writeFileSync(`${temporaryDirectoryPath}/src/style.css`, `.a { color: blue; }\n`);

        await waitForRebuild(3);

        expect(existsSync(cssPath)).toBe(true);
        expect(readFileSync(cssPath)).toContain("color: blue");

        proc.kill("SIGINT");
        const result = await proc;

        expect(result.signal === "SIGINT" || result.exitCode === 0).toBe(true);
    });

    it("should keep watching when the onSuccess command fails", { timeout: 30_000 }, async () => {
        expect.assertions(4);

        // Start watch with a failing onSuccess command (exit 1)
        const proc = execaNode(
            join(distributionPath, "cli/index.js"),
            ["build", "--development", "--watch", "--onSuccess=exit 1", "--no-validation"],
            {
                cwd: temporaryDirectoryPath,
                reject: false,
            },
        );

        // Accumulate both stdout and stderr — logger.error may write to either
        let output = "";

        proc.stdout.on("data", (chunk) => {
            output += String(chunk);
        });

        proc.stderr.on("data", (chunk) => {
            output += String(chunk);
        });

        const waitForMessage = async (message: string, timeoutMs = 10_000) => {
            const start = Date.now();

            while (Date.now() - start < timeoutMs) {
                if (output.includes(message)) {
                    return;
                }

                // eslint-disable-next-line no-await-in-loop -- intentional sequential poll: must wait between output checks for the failure message
                await sleep(100);
            }

            throw new Error(`Timed out waiting for: "${message}"\noutput so far:\n${output}`);
        };

        // Wait for the initial build's onSuccess failure to be logged
        await waitForMessage("onSuccess script failed with exit code 1");

        // The process must still be alive after a failing onSuccess (execa uses null for "not yet exited")
        expect(proc.exitCode).toBeNull();

        // Trigger a rebuild to confirm the watcher kept running
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const a = 2;\n`);

        // Wait for a second occurrence of the failure message (proving watcher rebuilt)
        const waitForSecondFailure = async () => {
            const start = Date.now();

            while (Date.now() - start < 10_000) {
                // Count occurrences of the failure message
                const count = (output.match(/onSuccess script failed with exit code 1/g) ?? []).length;

                if (count >= 2) {
                    return;
                }

                // eslint-disable-next-line no-await-in-loop -- intentional sequential poll: must wait between output checks until failure appears twice
                await sleep(100);
            }

            throw new Error(`Timed out waiting for second onSuccess failure after rebuild\noutput so far:\n${output}`);
        };

        await waitForSecondFailure();

        // The process must still be alive after the second failure (execa uses null for "not yet exited")
        expect(proc.exitCode).toBeNull();

        // Stop the watcher
        proc.kill("SIGINT");
        const result = await proc; // resolved due to reject:false

        // Assert no unhandled rejection crashed the process
        expect(output).not.toContain("UnhandledPromiseRejection");
        // Process terminated by our SIGINT is acceptable
        expect(result.signal === "SIGINT" || result.exitCode === 0).toBe(true);
    });
});
