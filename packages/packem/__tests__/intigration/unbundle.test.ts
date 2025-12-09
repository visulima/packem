import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFile } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem unbundle", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory({
            prefix: "packem-unbundle",
        });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should preserve source file structure when unbundle is enabled", async () => {
        expect.assertions(5);

        // Create source files matching the user's example
        await writeFile(
            `${temporaryDirectoryPath}/src/a/indexA.ts`,
            `export const a = 'a';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/b/indexB.ts`,
            `export const b = 'b';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/c/indexC.ts`,
            `export const c = 'c';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { a } from './a/indexA';
export { b } from './b/indexB';
export { c } from './c/indexC';
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            engines: {
                node: ">=20",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.d.ts"],
                },
            },
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                emitESM: true,
                failOnWarn: false,
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        // Allow warnings in stderr since we have failOnWarn: false
        expect(binProcess.exitCode).toBe(0);

        // Verify the output structure is preserved
        // With preserveModules, files should preserve the full directory structure
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/b/indexB.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/c/indexC.js`)).toBe(true);
    });

    it("should preserve source file structure with nested directories", async () => {
        expect.assertions(4);

        // Create nested structure
        await writeFile(
            `${temporaryDirectoryPath}/src/utils/helpers.ts`,
            `export const helper = 'helper';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/components/Button.tsx`,
            `export const Button = () => 'button';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { helper } from './utils/helpers';
export { Button } from './components/Button';
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            engines: {
                node: ">=20",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.d.ts"],
                },
            },
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                emitESM: true,
                failOnWarn: false,
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        // Allow warnings in stderr since we have failOnWarn: false
        expect(binProcess.exitCode).toBe(0);

        // Verify nested structure is preserved
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/utils/helpers.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/components/Button.js`)).toBe(true);
    });

    it("should verify exports are correct in unbundle mode", async () => {
        expect.assertions(7);

        await writeFile(
            `${temporaryDirectoryPath}/src/a/indexA.ts`,
            `export const a = 'a';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/b/indexB.ts`,
            `export const b = 'b';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { a } from './a/indexA';
export { b } from './b/indexB';
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            engines: {
                node: ">=20",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
            typesVersions: {
                "*": {
                    ".": ["./dist/index.d.ts"],
                },
            },
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                emitESM: true,
                failOnWarn: false,
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        // Allow warnings in stderr since we have failOnWarn: false
        expect(binProcess.exitCode).toBe(0);

        // Verify the main index file exports from the correct paths
        const indexJs = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(indexJs).toContain("from './a/indexA.js'");
        expect(indexJs).toContain("from './b/indexB.js'");

        // Verify the individual module files exist and have correct content
        const indexAjs = readFileSync(`${temporaryDirectoryPath}/dist/a/indexA.js`);

        expect(indexAjs).toContain("const a");
        expect(indexAjs).toContain("export { a }");

        const indexBjs = readFileSync(`${temporaryDirectoryPath}/dist/b/indexB.js`);

        expect(indexBjs).toContain("const b");
        expect(indexBjs).toContain("export { b }");
    });
});
