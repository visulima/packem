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
        expect.assertions(10);

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
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Verify the output structure is preserved
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/b/indexB.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/c/indexC.mjs`)).toBe(true);

        // Verify CJS output structure is also preserved
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/b/indexB.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/c/indexC.cjs`)).toBe(true);
    });

    it("should preserve source file structure with nested directories", async () => {
        expect.assertions(8);

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
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Verify nested structure is preserved
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/utils/helpers.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/components/Button.mjs`)).toBe(true);

        // Verify CJS output
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/utils/helpers.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/components/Button.cjs`)).toBe(true);
    });

    it("should verify exports are correct in unbundle mode", async () => {
        expect.assertions(6);

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
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Verify the main index file exports from the correct paths
        const indexMjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(indexMjs).toContain("from './a/indexA'");
        expect(indexMjs).toContain("from './b/indexB'");

        // Verify the individual module files exist and have correct content
        const indexAMjs = readFileSync(`${temporaryDirectoryPath}/dist/a/indexA.mjs`);

        expect(indexAMjs).toContain("export const a");

        const indexBMjs = readFileSync(`${temporaryDirectoryPath}/dist/b/indexB.mjs`);

        expect(indexBMjs).toContain("export const b");
    });

    it("should work with ESM-only output", async () => {
        expect.assertions(5);

        await writeFile(
            `${temporaryDirectoryPath}/src/a/indexA.ts`,
            `export const a = 'a';
`,
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export { a } from './a/indexA';
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "./dist/index.mjs",
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Verify ESM output structure
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.mjs`)).toBe(true);

        // Verify CJS output is not created when only ESM is requested
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(false);
    });
});
