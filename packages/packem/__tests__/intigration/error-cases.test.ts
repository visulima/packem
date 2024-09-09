import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync } from "../helpers";

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

        expect(binProcess.stderr).toContain("package.json not found at " + temporaryDirectoryPath);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json is invalid", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/package.json`, "{");

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("Unexpected end of JSON input in");
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

        expect(binProcess.stderr).toContain("No 'src' directory found. Please provide entries manually.");
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

        expect(binProcess.stderr).toContain("No source files found in 'src' directory. Please provide entries manually.");
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

        expect(binProcess.stderr).toContain("No entries detected. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it.todo("should throw a error if conflicting entry in package.json", async () => {
        expect.assertions(2);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            main: "dist/index.mjs",
            module: "dist/index.mjs",
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, "");

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toContain(
            `Conflicting field "module" with entry "dist/index.mjs" detected. Conflicts with "main" field. Please change one of the entries inside your package.json.`,
        );
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as ESM", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = "foo";`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = "index";`);

        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    require: "./dist/index.mjs",
                },
                "./foo": {
                    import: "./dist/foo.cjs",
                },
            },
            files: ["dist"],
            main: "./dist/index.mjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackemSync("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain(`'main' field in your package.json should not have a '.mjs' extension`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as CJS", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = "foo";`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = "index";`);

        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    require: "./dist/index.mjs",
                },
                "./foo": {
                    import: "./dist/foo.cjs",
                },
            },
            files: ["dist"],
            main: "./dist/index.cjs",
            module: "./dist/index.cjs",
        });

        const binProcess = await execPackemSync("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain(`'module' field in your package.json should not have a '.cjs' extension`);
        expect(binProcess.exitCode).toBe(1);
    });
});
