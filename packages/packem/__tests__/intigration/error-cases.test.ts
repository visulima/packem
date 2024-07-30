import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem error cases", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath, {});
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should throw a error if no package.json was found", async () => {
        expect.assertions(2);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toContain("package.json not found at " + temporaryDirectoryPath);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json is invalid", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/package.json`, "{");

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toContain("Unexpected end of JSON input in");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if no src directory was found", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toContain("No 'src' directory found. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if src dir has no entries", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        mkdirSync(`${temporaryDirectoryPath}/src`);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toContain("No source files found in 'src' directory. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json has no entry", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "");

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toContain("No entries detected. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it.todo("should throw a error if conflicting entry in package.json", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            main: "dist/index.js",
            module: "dist/index.js",
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "");

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stdout)).resolves.toBe("");
        await expect(streamToString(binProcess.stderr)).resolves.toContain(
            `Conflicting field "module" with entry "dist/index.js" detected. Conflicts with "main" field. Please change one of the entries inside your package.json.`,
        );
        expect(binProcess.exitCode).toBe(1);
    });
});
