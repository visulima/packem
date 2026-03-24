import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

/**
 * Strips ANSI escape codes from text for reliable matching.
 */
const stripAnsi = (text: string): string => text.replaceAll(/\u001B\[\d+(?:;\d+)*m/g, "");

/**
 * Asserts that the given patterns appear in the text in the specified order.
 * ANSI codes are stripped before matching.
 */
const expectMatchesInOrder = (text: string, patterns: RegExp[]): void => {
    const cleaned = stripAnsi(text);
    let lastIndex = 0;

    for (const pattern of patterns) {
        const match = cleaned.slice(lastIndex).match(pattern);

        expect(match, `Expected pattern ${pattern} to match in remaining text starting at index ${lastIndex}`).toBeTruthy();

        lastIndex += match!.index! + match![0].length;
    }
};

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

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`package.json not found at ${temporaryDirectoryPath}`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json is invalid", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/package.json`, "{");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        const NODE_JS_VERSION = Number(process.versions.node.split(".")[0]);
        // Node.js changed the error message for invalid package.json across versions:
        // < 20: "Unexpected end of JSON input in"
        // 20-21: "Expected property name or"
        // 22+: "Invalid package config" (ERR_INVALID_PACKAGE_CONFIG)
        const expectedMessage
            = NODE_JS_VERSION < 20 ? "Unexpected end of JSON input in" : NODE_JS_VERSION < 22 ? "Expected property name or" : "Invalid package config";

        expect(binProcess.stderr).toContain(expectedMessage);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if no src directory was found", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("No 'src' directory found. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if src dir has no entries", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });

        mkdirSync(`${temporaryDirectoryPath}/src`);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("No source files found in 'src' directory. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if package.json has no entry", async () => {
        expect.assertions(2);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, "");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("No entries detected. Please provide entries manually.");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if conflicting entry in package.json", async () => {
        expect.assertions(3);

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {},
            engines: {
                node: ">=20",
            },
            files: ["dist"],
            main: "dist/index.js",
            module: "dist/index.js",
            name: "pkg",
        });
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, "");

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain(`Conflict detected: The 'module' and 'main' fields both point to 'dist/index`);
        expect(binProcess.stdout).toContain(`Please ensure they refer to different module types.`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should warn on invalid exports as ESM", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = "foo";`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = "index";`);

        await createPackageJson(temporaryDirectoryPath, {
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

        const binProcess = await execPackem("build", ["--validation"], {
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

        await createPackageJson(temporaryDirectoryPath, {
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

        const binProcess = await execPackem("build", ["--validation"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stdout).toContain(`The 'module' field in your package.json should not use a '.cjs' extension f`);
        expect(binProcess.stdout).toContain(`or ES modules.`);
        expect(binProcess.exitCode).toBe(1);
    });

    describe("import trace", () => {
        it("should show import trace with 2 levels on build error", async () => {
            expect.assertions(5);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export { value } from "./broken";`);
            // Syntax error that esbuild cannot transform
            writeFileSync(`${temporaryDirectoryPath}/src/broken.ts`, `export const value: string = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expectMatchesInOrder(binProcess.stderr, [
                /broken\.ts/,
                /Import trace:\n/,
                /src[/\\]index\.ts\n/,
                /↳.*src[/\\]broken\.ts/,
            ]);
        });

        it("should show import trace with 3 levels on build error", async () => {
            expect.assertions(6);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export { value } from "./middle";`);
            writeFileSync(`${temporaryDirectoryPath}/src/middle.ts`, `export { value } from "./broken";`);
            writeFileSync(`${temporaryDirectoryPath}/src/broken.ts`, `export const value: string = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expectMatchesInOrder(binProcess.stderr, [
                /broken\.ts/,
                /Import trace:\n/,
                /src[/\\]index\.ts\n/,
                /↳.*src[/\\]middle\.ts\n/,
                /↳.*src[/\\]broken\.ts/,
            ]);
        });

        it("should not show import trace when error is in entry point", async () => {
            expect.assertions(3);

            // Syntax error directly in the entry point
            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value: string = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                module: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expect(binProcess.stderr).toMatch(/index\.ts/);
            // Entry point errors should NOT show import trace (trace length = 1)
            expect(binProcess.stderr).not.toMatch(/Import trace:/);
        });

        it("should show import trace with plain js files", async () => {
            expect.assertions(5);

            writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export { value } from "./broken.js";`);
            // Syntax error that esbuild cannot transform
            writeFileSync(`${temporaryDirectoryPath}/src/broken.js`, `export const value = !!!;`);

            await createPackageJson(temporaryDirectoryPath, {
                module: "./dist/index.mjs",
                type: "module",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expectMatchesInOrder(binProcess.stderr, [
                /broken\.js/,
                /Import trace:\n/,
                /src[/\\]index\.js\n/,
                /↳.*src[/\\]broken\.js/,
            ]);
        });

        it("should show import trace on dts build error", async () => {
            expect.assertions(5);

            await installPackage(temporaryDirectoryPath, "typescript");

            // index.ts re-exports from broken.ts
            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export { helper } from "./broken";`);
            // broken.ts has a value export (JS build succeeds) AND a type-only re-export
            // from a non-existent module. Esbuild strips the type export for the JS build,
            // but tsc preserves it in the .d.ts — causing the DTS build to fail on resolution.
            writeFileSync(
                `${temporaryDirectoryPath}/src/broken.ts`,
                `export const helper = 42;\nexport type { MissingType } from "./does-not-exist";`,
            );

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                exports: {
                    ".": {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                },
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.exitCode).toBe(1);
            expectMatchesInOrder(binProcess.stderr, [
                /does-not-exist/,
                /Import trace:\n/,
                /src[/\\]index\.d\.ts\n/,
                /↳.*src[/\\]broken\.d\.ts/,
            ]);
        });
    });
});
