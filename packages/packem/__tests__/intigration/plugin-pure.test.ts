import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem plugin-pure", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should add pure annotations for Symbol() patterns", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Test Symbol patterns that should be marked as pure
export const sym1 = Symbol();
export const sym2 = Symbol.for("test");
export const sym3 = Symbol.keyFor(sym2);

// Test unused symbols that should be tree-shaken
const unusedSym = Symbol("unused");
const unusedSymFor = Symbol.for("unused");

export const used = "only this should remain";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    pluginPure: {},
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should contain pure annotations for Symbol functions
        expect(mjsContent).toContain("/*@__PURE__*/");
    });

    it("should add pure annotations for Proxy constructor", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Test Proxy pattern that should be marked as pure
export const createProxy = (target: object) => new Proxy(target, {
    get(obj, prop) {
        return obj[prop as keyof typeof obj];
    }
});

// Test unused Proxy that should be tree-shaken
const unusedProxy = new Proxy({}, {});

export const used = "only this should remain";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    pluginPure: {},
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should contain pure annotations for Proxy constructor
        expect(mjsContent).toContain("/* @__PURE__ */");
    });

    it("should add pure annotations for Object utility methods", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Test Object utility patterns that should be marked as pure
export const createObj = () => Object.create(null);
export const freezeObj = (obj: object) => Object.freeze(obj);
export const assignObj = (target: object, source: object) => Object.assign(target, source);

// Test unused Object utilities that should be tree-shaken
const unusedCreate = Object.create(null);
const unusedFreeze = Object.freeze({});

export const used = "only this should remain";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    pluginPure: {},
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should contain pure annotations for Object utility methods
        expect(mjsContent).toContain("/* @__PURE__ */");
    });

    it("should work when pluginPure is disabled", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const sym = Symbol();
export const used = "this should remain";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    pluginPure: false,
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should still build successfully without pure annotations
        expect(mjsContent).toContain("Symbol()");
    });

    it("should support custom pure annotations configuration", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Custom function that we want to mark as pure
function customPureFunction() {
    return Math.random();
}

export const result1 = customPureFunction();

// This should be tree-shaken when marked as pure
const unusedResult = customPureFunction();

export const used = "only this should remain";`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    pluginPure: {
                        functions: ["customPureFunction"],
                    },
                },
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // Should contain pure annotations for custom function
        expect(mjsContent).toContain("/*@__PURE__*/");
    });
});
