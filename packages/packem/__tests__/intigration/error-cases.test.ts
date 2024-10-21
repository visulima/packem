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

        await createPackemConfig(temporaryDirectoryPath);
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

        const NODE_JS_VERSION = Number(process.versions.node.split(".")[0]);

        expect(binProcess.stderr).toContain(NODE_JS_VERSION < 20 ? "Unexpected end of JSON input in" : "Expected property name or");
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

    it("should throw a error if conflicting entry in package.json", async () => {
        expect.assertions(3);

        createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            files: ["dist"],
            main: "dist/index.mjs",
            module: "dist/index.mjs",
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, "");

        const binProcess = await execPackemSync("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain(`Conflict detected: The 'module' and 'main' fields both point to `);
        expect(binProcess.stdout).toContain(`'dist/index.mjs'. Please ensure they refer to different module types.`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as ESM", async () => {
        expect.assertions(3);

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

        expect(binProcess.stdout).toContain(`The 'main' field in your package.json should not use a '.mjs' extension for`);
        expect(binProcess.stdout).toContain(`CommonJS modules.`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as CJS", async () => {
        expect.assertions(3);

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

        expect(binProcess.stdout).toContain(`The 'module' field in your package.json should not use a '.cjs' extension`);
        expect(binProcess.stdout).toContain(`for ES modules.`);
        expect(binProcess.exitCode).toBe(1);
    });
});
