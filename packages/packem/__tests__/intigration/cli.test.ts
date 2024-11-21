import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem cli", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should support of tsconfig overwrite", async () => {
        expect.assertions(5);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default class A {}`);
        await createTsConfig(
            temporaryDirectoryPath,
            {
                compilerOptions: { target: "es2018" },
            },
            ".build",
        );
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "5",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await installPackage(temporaryDirectoryPath, "typescript");

        const binProcessEs2018 = await execPackemSync("build", ["--tsconfig=tsconfig.build.json"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcessEs2018.stderr).toBe("");
        expect(binProcessEs2018.exitCode).toBe(0);

        const dMtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const dTsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const mtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContentEs2018).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const _A = class _A {
};
__name(_A, "A");
let A = _A;

export { A as default };
`);
    });

    it("should run in development mode if no NODE_ENV and development option was given", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", ["--development"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).toContain("development");
        expect(binProcess.stdout).toContain("environment with");
        expect(binProcess.stdout).not.toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
    });

    it("should run in production mode if no NODE_ENV and production option was given", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", ["--production"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).toContain("production");
        expect(binProcess.stdout).toContain("environment with");
        expect(binProcess.stdout).toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContent).toBe(`const o=1;export{o as a};
`);
    });

    it("should not clean the dist directory before building, when --no-clean option was given", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);
        writeFileSync(`${temporaryDirectoryPath}/dist/dont-delete.txt`, `dot do it`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", ["--no-clean"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).not.toContain("Cleaning dist directory");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(`${temporaryDirectoryPath}/dist/dont-delete.txt`)).toBeTruthy();
    });

    it("should clean the dist directory before building, when no --no-clean option was given", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);
        writeFileSync(`${temporaryDirectoryPath}/dist/dont-delete.txt`, `dot do it`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Cleaning dist directory");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(`${temporaryDirectoryPath}/dist/dont-delete.txt`)).toBeFalsy();
    });

    it("should generate only d.ts files when --dts-only option was given", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", ["--dts-only"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBeFalsy();
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBeFalsy();
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.d.mts`)).toBeTruthy();
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.d.cts`)).toBeTruthy();
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBeTruthy();
    });

    it("should run 'onSuccess' when option was given", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", ["--onSuccess=echo hello && echo world"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("hello");
        expect(binProcess.stdout).toContain("world");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
    });

    it("should run 'onSuccess' when packem config has configured onSuccess option", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                onSuccess: "echo hello && echo world",
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("hello");
        expect(binProcess.stdout).toContain("world");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
    });
});
