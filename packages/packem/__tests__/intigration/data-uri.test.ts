import { mkdirSync, writeFileSync } from "node:fs";

import { readFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("data-uri plugin", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
    // cleanup handled by harness elsewhere if needed
    });

    it("emits tiny data-uri for svg with ?data-uri", async () => {
        expect.assertions(3);

        mkdirSync(`${temporaryDirectoryPath}/src`, { recursive: true });
        writeFileSync(`${temporaryDirectoryPath}/src/icon.svg`, `<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import icon from './icon.svg?data-uri';

export const data = icon;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should be a data:image/svg+xml URI and not base64
        expect(mjsContent).toContain("data:image/svg+xml,");
    });

    it("emits base64 data-uri for non-svg with ?data-uri", async () => {
        expect.assertions(3);

        mkdirSync(`${temporaryDirectoryPath}/src`, { recursive: true });
        writeFileSync(`${temporaryDirectoryPath}/src/file.txt`, `hello world`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import file from './file.txt?data-uri';

export const data = file;`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should be a data URI with base64 for text/plain
        expect(mjsContent).toMatch(/data:text\/plain;.*base64,/);
    });
});
