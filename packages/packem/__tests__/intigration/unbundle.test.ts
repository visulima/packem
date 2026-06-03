import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFile } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";
import { normalizeBundleOutput } from "../helpers/testing-utils";

describe("packem unbundle", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
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
        const indexJs = normalizeBundleOutput(readFileSync(`${temporaryDirectoryPath}/dist/index.js`));

        expect(indexJs).toContain("from './a/indexA.js'");
        expect(indexJs).toContain("from './b/indexB.js'");

        // Verify the individual module files exist and have correct content
        const indexAjs = normalizeBundleOutput(readFileSync(`${temporaryDirectoryPath}/dist/a/indexA.js`));

        expect(indexAjs).toContain("const a");
        expect(indexAjs).toContain("export { a }");

        const indexBjs = normalizeBundleOutput(readFileSync(`${temporaryDirectoryPath}/dist/b/indexB.js`));

        expect(indexBjs).toContain("const b");
        expect(indexBjs).toContain("export { b }");
    });

    it("should infer emit formats from package.json without explicit emitESM/failOnWarn", async () => {
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
        // ESM package whose exports only carry a `default` + `types`: unbundle
        // mode must still infer ESM + declarations from this (the regression —
        // previously it emitted nothing and failed validation on the missing files).
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            engines: { node: ">=20" },
            exports: {
                ".": {
                    default: "./dist/index.js",
                    types: "./dist/index.d.ts",
                },
            },
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

        // No failOnWarn override: a clean build proves the emitted files match
        // the package.json exports (index.js + index.d.ts) and the source
        // structure is preserved.
        expect(binProcess.exitCode).toBe(0);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.d.ts`)).toBe(true);
    });

    it("should infer CJS + declarations from a commonjs package.json", async () => {
        expect.assertions(5);

        await writeFile(`${temporaryDirectoryPath}/src/a/indexA.ts`, `export const a = 'a';\n`);
        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export { a } from './a/indexA';\n`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            engines: { node: ">=20" },
            exports: {
                ".": {
                    require: "./dist/index.js",
                    types: "./dist/index.d.ts",
                },
            },
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

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        // preserveModules emits `.js` for the chosen format; type:commonjs makes
        // those files CommonJS. No `.mjs` should be emitted (ESM not inferred).
        expect(binProcess.exitCode).toBe(0);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(false);
    });

    it("should infer dual ESM+CJS formats from import/require conditions", async () => {
        expect.assertions(6);

        await writeFile(`${temporaryDirectoryPath}/src/a/indexA.ts`, `export const a = 'a';\n`);
        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export { a } from './a/indexA';\n`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            engines: { node: ">=20" },
            exports: {
                ".": {
                    import: "./dist/index.js",
                    require: "./dist/index.cjs",
                    types: { import: "./dist/index.d.mts", require: "./dist/index.d.cts" },
                },
            },
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

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        // ESM stays `.js` (type:module); CJS disambiguates as `.cjs`. Both
        // declaration flavors are emitted. Source structure is preserved.
        expect(binProcess.exitCode).toBe(0);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.mts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.cts`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/a/indexA.cjs`)).toBe(true);
    });

    it("should not emit declarations when the package.json declares no types", async () => {
        expect.assertions(3);

        await writeFile(`${temporaryDirectoryPath}/src/a/indexA.ts`, `export const a = 'a';\n`);
        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export { a } from './a/indexA';\n`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            engines: { node: ">=20" },
            exports: {
                ".": {
                    default: "./dist/index.js",
                },
            },
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

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        // No `types` anywhere -> declaration inference is disabled -> JS only.
        expect(binProcess.exitCode).toBe(0);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(false);
    });

    it("should respect an explicit emitCJS over package-type inference", async () => {
        expect.assertions(3);

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'a';\n`);

        await installPackage(temporaryDirectoryPath, "typescript");
        // type:module would infer ESM, but an explicit emitCJS must win. In
        // preserveModules the file stays `index.js`, so assert on the emitted
        // module format (CommonJS) rather than the extension.
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            engines: { node: ">=20" },
            exports: {
                ".": {
                    require: "./dist/index.js",
                },
            },
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { rootDir: "./src" },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                emitCJS: true,
                unbundle: true,
            },
        });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);
        expect(existsSync(`${temporaryDirectoryPath}/dist/index.js`)).toBe(true);

        // CommonJS output (explicit emitCJS), not the ESM that type:module infers.
        const indexJs = normalizeBundleOutput(readFileSync(`${temporaryDirectoryPath}/dist/index.js`));

        expect(indexJs).toContain("exports");
    });
});
