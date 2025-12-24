import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem cli", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should support of tsconfig overwrite", async () => {
        expect.assertions(4);

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
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await installPackage(temporaryDirectoryPath, "typescript");

        const binProcessEs2018 = await execPackem("build", ["--tsconfig=tsconfig.build.json"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcessEs2018.stderr).toBe("");
        expect(binProcessEs2018.exitCode).toBe(0);

        const dMtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dMtsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const mtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContentEs2018).toMatchInlineSnapshot(`
          "class A {
          }

          export { A as default };
          "
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
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--development"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).toContain("development");
        expect(binProcess.stdout).toContain("environment with");
        expect(binProcess.stdout).not.toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
    });

    it("should not replace the NODE_ENV by default if no development or production option was given", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "@types/node");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = process.env.NODE_ENV;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--no-environment"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).not.toContain("development");
        expect(binProcess.stdout).not.toContain("environment with");
        expect(binProcess.stdout).not.toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const a = process.env.NODE_ENV;

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
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--production"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).toContain("production");
        expect(binProcess.stdout).toContain("environment with");
        expect(binProcess.stdout).toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const o=1;export{o as a};
`);
    });

    it("should load environment variables from .env file with prefix filter", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "@types/node");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const apiUrl = process.env.PACKEM_API_URL;
export const version = process.env.PACKEM_VERSION;
export const ignored = process.env.OTHER_VAR;`,
        );

        writeFileSync(`${temporaryDirectoryPath}/.env`, "PACKEM_API_URL=https://api.example.com\nPACKEM_VERSION=1.0.0\nOTHER_VAR=should-be-ignored\n");

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--env-file", ".env", "--env-prefix", "PACKEM_"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toContain("const apiUrl = \"https://api.example.com\"");
        expect(mtsContent).toContain("const version = \"1.0.0\"");
        expect(mtsContent).toContain("const ignored = process.env.OTHER_VAR");
    });

    it("should load environment variables from .env file via config file", async () => {
        expect.assertions(2);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "@types/node");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const apiUrl = process.env.PACKEM_API_URL;
export const version = process.env.PACKEM_VERSION;`,
        );

        writeFileSync(`${temporaryDirectoryPath}/.env`, "PACKEM_API_URL=https://api.example.com\nPACKEM_VERSION=1.0.0\n");

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            envFile: ".env",
            envPrefix: "PACKEM_",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toContain("const apiUrl = \"https://api.example.com\"");
        expect(mtsContent).toContain("const version = \"1.0.0\"");
    });

    it("should allow CLI env vars to override .env file vars", async () => {
        expect.assertions(2);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "@types/node");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const apiUrl = process.env.PACKEM_API_URL;
export const version = process.env.PACKEM_VERSION;`,
        );

        writeFileSync(`${temporaryDirectoryPath}/.env`, "PACKEM_API_URL=https://api.example.com\nPACKEM_VERSION=1.0.0\n");

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--env-file", ".env", "--env-prefix", "PACKEM_", "--env", "PACKEM_VERSION=2.0.0"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toContain("const apiUrl = \"https://api.example.com\"");
        expect(mtsContent).toContain("const version = \"2.0.0\""); // CLI override
    });

    it("should handle non-existent .env file gracefully", async () => {
        expect.assertions(2);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--env-file", ".env.nonexistent"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
    });

    it("should enable minify when --production option is used", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const myVariable = 42;
export function myFunction() {
    return myVariable * 2;
}`,
        );

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            engines: {
                node: ">=18.0.0",
            },
            exports: {
                ".": {
                    import: "./dist/index.js",
                    types: "./dist/index.d.ts",
                },
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--production"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toMatchSnapshot("minified output");
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
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--no-clean"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).not.toContain("Cleaning dist directory");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);

        expect(existsSync(`${temporaryDirectoryPath}/dist/dont-delete.txt`)).toBe(true);
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
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Cleaning dist directory");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);

        expect(existsSync(`${temporaryDirectoryPath}/dist/dont-delete.txt`)).toBe(false);
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

        const binProcess = await execPackem("build", ["--dts-only"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(false);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(false);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.d.mts`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.d.cts`)).toBe(true);
        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.d.ts`)).toBe(true);
    });

    it("should run 'onSuccess' when option was given", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const a = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--onSuccess=echo hello world"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("hello world");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

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
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                onSuccess: "echo hello; echo world",
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("hello");
        expect(binProcess.stdout).toContain("world");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toBe(`const a = 1;

export { a };
`);
    });

    it("should externalize dependencies provided by --external option", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { __TEST_EXPECTED_STRING__ } from '@test/shouldbeexternal'
import bar from 'bar-package'

export function baz() {
  return __TEST_EXPECTED_STRING__
}

export function barFunction() {
  return bar
}`,
        );

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--external=@test/shouldbeexternal"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).toContain("development");
        expect(binProcess.stdout).toContain("environment with");
        expect(binProcess.stdout).not.toContain("Minification is enabled, the output will be minified");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mtsContent).toMatchInlineSnapshot(`
          "import { __TEST_EXPECTED_STRING__ } from '@test/shouldbeexternal';
          import bar from 'bar-package';

          function baz() {
            return __TEST_EXPECTED_STRING__;
          }
          function barFunction() {
            return bar;
          }

          export { barFunction, baz };
          "
        `);
    });

    it("should be able to opt out sourcemap when minify", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const someFunction = () => {
  const data = { message: "Hello World" };
  return data.message;
};`,
        );

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.js",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                sourcemap: false,
            },
        });

        const binProcess = await execPackem("build", ["--production"], {
            cwd: temporaryDirectoryPath,
            env: {},
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("Preparing build for");
        expect(binProcess.stdout).toContain("production");
        expect(binProcess.stdout).toContain("Minification is enabled, the output will be minified");

        expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/index.js.map`)).toBe(false);
    });

    describe("migrate command", () => {
        it("should migrate from tsup to packem", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup src/index.ts",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Migrating `devDependencies` from tsup to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `build` script from tsup to packem");
        });

        it("should migrate from unbuild to packem", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    unbuild: "^2.0.0",
                },
                scripts: {
                    build: "unbuild",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Migrating `devDependencies` from unbuild to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `build` script from unbuild to packem");
        });

        it("should migrate from bunchee to packem", async () => {
            expect.assertions(5);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    bunchee: "^5.0.0",
                },
                scripts: {
                    build: "bunchee",
                    dev: "bunchee --watch",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Migrating `devDependencies` from bunchee to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `build` script from bunchee to packem");
            expect(binProcess.stdout).toContain("Migrating `dev` script from bunchee to packem");
        });

        it("should migrate multiple bundlers at once", async () => {
            expect.assertions(7);

            await createPackageJson(temporaryDirectoryPath, {
                dependencies: {
                    tsup: "^8.0.0",
                },
                devDependencies: {
                    bunchee: "^5.0.0",
                    unbuild: "^2.0.0",
                },
                scripts: {
                    build: "tsup src/index.ts",
                    bundle: "bunchee src/main.ts",
                    dev: "unbuild --watch",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Migrating `dependencies` from tsup to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `devDependencies` from unbuild to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `devDependencies` from bunchee to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `build` script from tsup to packem");
            expect(binProcess.stdout).toContain("Migrating `bundle` script from bunchee to packem");
        });

        it("should handle tsup-node variant", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "tsup-node": "^8.0.0",
                },
                scripts: {
                    build: "tsup-node src/index.ts",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Migrating `devDependencies` from tsup-node to @visulima/packem");
            expect(binProcess.stdout).toContain("Migrating `build` script from tsup to packem");
        });

        it("should detect config files and warn about manual migration", async () => {
            expect.assertions(3);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup src/index.ts",
                },
                tsup: {
                    entry: ["src/index.ts"],
                    format: ["cjs", "esm"],
                },
            });

            writeFileSync(`${temporaryDirectoryPath}/tsup.config.ts`, "export default { entry: [\"src/index.ts\"] }");

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.ts`. Consider creating packem.config.ts instead");
        });

        it("should warn when no migratable dependencies are found", async () => {
            expect.assertions(3);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "some-other-tool": "^1.0.0",
                },
                scripts: {
                    build: "some-other-tool",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
                reject: false,
            });

            expect(binProcess.stderr).toContain("No migration performed");
            expect(binProcess.exitCode).toBe(1);

            expect(binProcess.stdout).toContain("No migratable bundler dependencies found in package.json");
        });

        it("should show dry-run changes with before/after content", async () => {
            expect.assertions(6);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup src/index.ts",
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("[dry-run] package.json changes:");
            expect(binProcess.stdout).toContain("Old content:");
            expect(binProcess.stdout).toContain("New content:");
            expect(binProcess.stdout).toContain("Migration completed");
        });

        it("should detect and warn about real-world tsup.config.ts file", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup",
                },
            });

            // Real-world tsup config example from common usage
            const tsupConfig = `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
})`;

            writeFileSync(`${temporaryDirectoryPath}/tsup.config.ts`, tsupConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.ts`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
        });

        it("should detect and warn about real-world tsup.config.js file", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup",
                },
            });

            // Real-world tsup config.js example
            const tsupConfig = `module.exports = {
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  noExternal: ['@myorg/utils'],
}`;

            writeFileSync(`${temporaryDirectoryPath}/tsup.config.js`, tsupConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.js`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
        });

        it("should detect and warn about real-world tsup.config.json file", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup",
                },
            });

            // Real-world tsup config.json example
            const tsupConfig = `{
  "entry": ["src/index.ts"],
  "format": ["cjs", "esm"],
  "dts": true,
  "sourcemap": true,
  "clean": true,
  "minify": true
}`;

            writeFileSync(`${temporaryDirectoryPath}/tsup.config.json`, tsupConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.json`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
        });

        it("should detect and warn about real-world unbuild build.config.ts file", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    unbuild: "^2.0.0",
                },
                scripts: {
                    build: "unbuild",
                },
            });

            // Real-world unbuild config example
            const unbuildConfig = `import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/cli',
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
})`;

            writeFileSync(`${temporaryDirectoryPath}/build.config.ts`, unbuildConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `build.config.ts`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
        });

        it("should detect and warn about real-world unbuild build.config.js file", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    unbuild: "^2.0.0",
                },
                scripts: {
                    build: "unbuild",
                },
            });

            // Real-world unbuild config.js example
            const unbuildConfig = `module.exports = {
  entries: ['src/index'],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
}`;

            writeFileSync(`${temporaryDirectoryPath}/build.config.js`, unbuildConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `build.config.js`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
        });

        it("should detect and warn about real-world bunchee.config.ts file", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    bunchee: "^5.0.0",
                },
                scripts: {
                    build: "bunchee",
                },
            });

            // Real-world bunchee config example
            const buncheeConfig = `export default {
  entry: 'src/index.ts',
  format: ['cjs', 'esm'],
  minify: true,
  sourcemap: true,
}`;

            writeFileSync(`${temporaryDirectoryPath}/bunchee.config.ts`, buncheeConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `bunchee.config.ts`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
        });

        it("should detect multiple config files from different bundlers", async () => {
            expect.assertions(6);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                    unbuild: "^2.0.0",
                },
                scripts: {
                    build: "tsup",
                },
            });

            writeFileSync(`${temporaryDirectoryPath}/tsup.config.ts`, "export default { entry: ['src/index.ts'] }");
            writeFileSync(`${temporaryDirectoryPath}/build.config.ts`, "export default { entries: ['src/index'] }");

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.ts`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Found config file `build.config.ts`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
            expect(binProcess.stdout).toContain("Migration completed");
        });

        it("should handle complex tsup config with all common options", async () => {
            expect.assertions(5);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup",
                    "build:watch": "tsup --watch",
                },
            });

            // Complex real-world tsup config with many options
            const complexTsupConfig = `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
    utils: 'src/utils/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  target: 'node18',
  outDir: 'dist',
  external: ['react', 'react-dom', '@types/node'],
  noExternal: ['@myorg/utils'],
  esbuildOptions(options) {
    options.banner = {
      js: '// My banner',
    }
  },
  onSuccess: 'echo "Build complete"',
})`;

            writeFileSync(`${temporaryDirectoryPath}/tsup.config.ts`, complexTsupConfig);

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.ts`. Consider creating packem.config.ts instead");
            expect(binProcess.stdout).toContain("Manual migration required for config files");
            expect(binProcess.stdout).toContain("Migrating `build:watch` script from tsup to packem");
        });

        it("should handle tsup config with package.json tsup field", async () => {
            expect.assertions(5);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup",
                },
                tsup: {
                    clean: true,
                    dts: true,
                    entry: ["src/index.ts", "src/cli.ts"],
                    external: ["react"],
                    format: ["cjs", "esm"],
                    sourcemap: true,
                    splitting: true,
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found `tsup` config field in package.json. Consider moving to packem.config.ts");
            expect(binProcess.stdout).toContain("Migrating `devDependencies` from tsup to @visulima/packem");
            expect(binProcess.stdout).toContain("Migration completed");
        });

        it("should handle unbuild config with package.json unbuild field", async () => {
            expect.assertions(4);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    unbuild: "^2.0.0",
                },
                scripts: {
                    build: "unbuild",
                },
                unbuild: {
                    clean: true,
                    declaration: true,
                    entries: ["src/index"],
                    rollup: {
                        emitCJS: true,
                    },
                },
            });

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found `unbuild` config field in package.json. Consider moving to packem.config.ts");
            expect(binProcess.stdout).toContain("Migration completed");
        });

        it("should handle all tsup config file variants", async () => {
            expect.assertions(9);

            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    tsup: "^8.0.0",
                },
                scripts: {
                    build: "tsup",
                },
            });

            const configs = [
                { content: "export default { entry: ['src/index.ts'] }", file: "tsup.config.ts" },
                { content: "export default { entry: ['src/index.ts'] }", file: "tsup.config.cts" },
                { content: "export default { entry: ['src/index.ts'] }", file: "tsup.config.mts" },
                { content: "module.exports = { entry: ['src/index.ts'] }", file: "tsup.config.js" },
                { content: "module.exports = { entry: ['src/index.ts'] }", file: "tsup.config.cjs" },
                { content: "export default { entry: ['src/index.ts'] }", file: "tsup.config.mjs" },
                { content: "{\"entry\": [\"src/index.ts\"]}", file: "tsup.config.json" },
            ];

            for (const config of configs) {
                writeFileSync(`${temporaryDirectoryPath}/${config.file}`, config.content);
            }

            const binProcess = await execPackem("migrate", ["--dry-run"], {
                cwd: temporaryDirectoryPath,
                env: {
                    ...process.env,
                    FORCE_COLOR: "0",
                },
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Found config file `tsup.config.ts`");
            expect(binProcess.stdout).toContain("Found config file `tsup.config.cts`");
            expect(binProcess.stdout).toContain("Found config file `tsup.config.mts`");
            expect(binProcess.stdout).toContain("Found config file `tsup.config.js`");
            expect(binProcess.stdout).toContain("Found config file `tsup.config.cjs`");
            expect(binProcess.stdout).toContain("Found config file `tsup.config.mjs`");
            expect(binProcess.stdout).toContain("Found config file `tsup.config.json`");
        });
    });
});
