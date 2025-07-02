import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem } from "../helpers";

describe("packem file extensions", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should use .js/.d.ts for ESM-only modern library", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const hello = "world";`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                declaration: true,
                module: "ESNext",
                moduleResolution: "bundler",
                outDir: "./dist",
                rootDir: "./src",
                target: "ES2020",
            },
            include: ["src/**/*"],
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^5.0.0",
            },
            main: "./dist/index.js",
            module: "./dist/index.js",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: true,
                emitCJS: false,
                emitESM: true,
                node10Compatibility: false,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
    });

    it("should use .js/.d.ts for CJS-only modern library", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const hello = "world";`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                declaration: true,
                module: "ESNext",
                moduleResolution: "bundler",
                outDir: "./dist",
                rootDir: "./src",
                target: "ES2020",
            },
            include: ["src/**/*"],
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^5.0.0",
            },
            main: "./dist/index.js",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: true,
                emitCJS: true,
                emitESM: false,
                node10Compatibility: false,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
    });

    it("should use traditional extensions for dual-format library", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const hello = "world";`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                declaration: true,
                module: "ESNext",
                moduleResolution: "bundler",
                outDir: "./dist",
                rootDir: "./src",
                target: "ES2020",
            },
            include: ["src/**/*"],
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^5.0.0",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.cts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: true,
                emitCJS: true,
                emitESM: true,
                node10Compatibility: false,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.cts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.mts`)).toBe(true);
    });

    it("should use traditional extensions for Node.js 10 compatibility", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const hello = "world";`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                declaration: true,
                module: "ESNext",
                moduleResolution: "bundler",
                outDir: "./dist",
                rootDir: "./src",
                target: "ES2020",
            },
            include: ["src/**/*"],
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^5.0.0",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: true,
                emitCJS: true,
                emitESM: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.mts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.cts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
    });

    it("should respect custom outputExtensionMap for single format", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const hello = "world";`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                declaration: true,
                module: "ESNext",
                moduleResolution: "bundler",
                outDir: "./dist",
                rootDir: "./src",
                target: "ES2020",
            },
            include: ["src/**/*"],
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^5.0.0",
            },
            main: "./dist/index.js",
            module: "./dist/index.js",
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: true,
                emitCJS: false,
                emitESM: true,
                node10Compatibility: false,
                outputExtensionMap: {
                    esm: "js",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Should use .js extension from outputExtensionMap
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);

        // Should use .d.ts extension (derived from .js)
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
    });

    it("should handle mixed custom extensions", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const hello = "world";`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                declaration: true,
                module: "ESNext",
                moduleResolution: "bundler",
                outDir: "./dist",
                rootDir: "./src",
                target: "ES2020",
            },
            include: ["src/**/*"],
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "^5.0.0",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.js",
            types: "./dist/index.d.cts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: true,
                emitCJS: true,
                emitESM: true,
                node10Compatibility: false,
                outputExtensionMap: {
                    cjs: "cjs",
                    esm: "js",
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // CJS should use .cjs extension
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.cts`)).toBe(true);

        // ESM should use .js extension
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);

        // .mjs should NOT exist
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(false);
    });
});
