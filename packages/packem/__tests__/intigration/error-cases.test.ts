import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync, writeJsonSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { execPackemSync, streamToString } from "../helpers";

describe("packem jsx", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should throw a error if no package.json was found", async () => {
        expect.assertions(2);

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toMatch("No such file or directory, for package.json found.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json is invalid", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/package.json`, "{");

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toMatch("Unexpected end of JSON input in");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if no src directory was found", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toMatch("No 'src' directory found. Please provide entries manually.");
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

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toMatch("No source files found in 'src' directory. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json has no entry", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "");

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toMatch("No entries detected. Please provide entries manually.");
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

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stdout)).resolves.toBe("");
        await expect(streamToString(binProcess.stderr)).resolves.toMatch(
            `Conflicting field "module" with entry "dist/index.js" detected. Conflicts with "main" field. Please change one of the entries inside your package.json.`,
        );
        expect(binProcess.exitCode).toBe(1);
    });
});
