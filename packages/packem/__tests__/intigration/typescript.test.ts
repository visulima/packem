/* eslint-disable no-secrets/no-secrets */
import { existsSync, symlinkSync } from "node:fs";
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFile, writeFile, writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { getRegexMatches } from "@visulima/packem-share/utils";
import { join } from "@visulima/path";
import { execa } from "execa";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

describe("packem typescript", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory({
            prefix: "packem-typescript",
        });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.each([
        ["cts", "cjs"],
        ["mts", "mjs"],
        ["ts", "cjs"],
    ])("should throw an error when .%s -> .%s file is used without typescript dependency", async (tsExtension, jsExtension) => {
        expect.assertions(2);

        await writeFile(`${temporaryDirectoryPath}/src/index.${tsExtension}`, `export default () => 'index';`);

        await createPackageJson(temporaryDirectoryPath, {
            exports: `./dist/index.${jsExtension}`,
            type: jsExtension === "mjs" ? "module" : "commonjs",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should show a info if declaration is disabled", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: { declaration: false },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Generation of declaration files are disabled.");
    });

    it("should not throw a error if declaration is disabled and a types fields are present", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
            },
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: { declaration: false },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Generation of declaration files are disabled.");
    });

    describe("resolve-typescript-mjs-cjs plugin", () => {
        it("should resolve .jsx -> .tsx", async () => {
            expect.assertions(3);

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.jsx";');
            await writeFile(`${temporaryDirectoryPath}/src/file.tsx`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .jsx -> .ts when .tsx does not exist", async () => {
            expect.assertions(3);

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import { value } from "./utils.jsx";\nconsole.log(value);');
            await writeFile(`${temporaryDirectoryPath}/src/utils.ts`, 'export const value = "from-ts-via-jsx";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("from-ts-via-jsx");
        });

        it("should resolve .js -> .tsx when .ts does not exist", async () => {
            expect.assertions(3);

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import { Component } from "./component.js";\nconsole.log(Component);');
            await writeFile(`${temporaryDirectoryPath}/src/component.tsx`, 'export const Component = "tsx-component";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("tsx-component");
        });

        it("should resolve .jsx -> .js", async () => {
            expect.assertions(3);

            await writeFile(`${temporaryDirectoryPath}/src/index.js`, 'import "./file.jsx";');
            await writeFile(`${temporaryDirectoryPath}/src/file.jsx`, "console.log(1);");

            await createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.js",
                type: "module",
            });
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .mjs -> .ts", async () => {
            expect.assertions(3);

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.mjs";');
            await writeFile(`${temporaryDirectoryPath}/src/file.mjs`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .cjs -> .ts", async () => {
            expect.assertions(3);

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.cjs";');
            await writeFile(`${temporaryDirectoryPath}/src/file.cjs`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should prefer .ts over .js in source code", async () => {
            expect.assertions(4);

            // In source code, TypeScript files should be preferred over JavaScript
            // when both exist for the same import specifier
            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import { value } from "./file.js"; console.log(value);');
            // Both files exist, .ts should be preferred
            await writeFile(`${temporaryDirectoryPath}/src/file.ts`, 'export const value = "from-typescript";');
            await writeFile(`${temporaryDirectoryPath}/src/file.js`, 'export const value = "from-javascript";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            // Should prefer .ts when both exist in source code
            expect(content).toMatch("from-typescript");
            expect(content).not.toMatch("from-javascript");
        });

        it("should prefer .js over .ts in node_modules (esbuild behavior)", async () => {
            expect.assertions(5);

            // Tests esbuild's resolution behavior where .js is preferred over .ts
            // in node_modules to avoid issues with:
            // 1. Packages that accidentally ship both .js and .ts
            // 2. Missing or unpublished tsconfig.json
            //
            // Resolution order:
            // - Source code: .ts before .js
            // - node_modules: .js before .ts
            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import { fromBoth } from 'pkg-with-both';
import { fromTs } from 'pkg-with-only-ts';
console.log(fromBoth, fromTs);
`,
            );

            await writeJson(join(temporaryDirectoryPath, "node_modules", "pkg-with-both", "package.json"), {
                main: "./index.js",
                name: "pkg-with-both",
                type: "module",
            });
            // Entry point imports from a relative file
            await writeFile(join(temporaryDirectoryPath, "node_modules", "pkg-with-both", "index.js"), 'export { fromBoth } from "./file.js";');
            // Package accidentally ships both .js and .ts for the same file
            await writeFile(join(temporaryDirectoryPath, "node_modules", "pkg-with-both", "file.js"), 'export const fromBoth = "compiled-js";');
            await writeFile(join(temporaryDirectoryPath, "node_modules", "pkg-with-both", "file.ts"), 'export const fromBoth: string = "source-ts";');

            await writeJson(join(temporaryDirectoryPath, "node_modules", "pkg-with-only-ts", "package.json"), {
                main: "./index.js",
                name: "pkg-with-only-ts",
                type: "module",
            });
            await writeFile(join(temporaryDirectoryPath, "node_modules", "pkg-with-only-ts", "index.js"), 'export { fromTs } from "./file.js";');
            // Package only ships .ts (forgot to compile or .npmignore misconfigured)
            await writeFile(join(temporaryDirectoryPath, "node_modules", "pkg-with-only-ts", "file.ts"), 'export const fromTs: string = "only-ts";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            // Should prefer .js when both exist in node_modules
            expect(content).toMatch("compiled-js");
            expect(content).not.toMatch("source-ts");

            // Should use .ts when only .ts exists in node_modules
            expect(content).toMatch("only-ts");
        });

        it("should resolve bare specifier .js through exports map with wildcards", async () => {
            expect.assertions(3);

            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import { value } from 'dep-wildcard/utils.js';
console.log(value);
`,
            );

            await writeJson(join(temporaryDirectoryPath, "node_modules", "dep-wildcard", "package.json"), {
                exports: {
                    "./*.js": "./dist/*.js",
                    "./*": "./dist/*.js",
                },
                name: "dep-wildcard",
                type: "module",
            });
            await writeFile(join(temporaryDirectoryPath, "node_modules", "dep-wildcard", "dist", "utils.js"), 'export const value = "hello";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "dep-wildcard": "*",
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("hello");
        });

        it("should resolve scoped bare specifier .js through exports map with wildcards", async () => {
            expect.assertions(3);

            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import { value } from '@scope/dep-wildcard/utils.js';
console.log(value);
`,
            );

            await writeJson(join(temporaryDirectoryPath, "node_modules", "@scope", "dep-wildcard", "package.json"), {
                exports: {
                    "./*.js": "./dist/*.js",
                    "./*": "./dist/*.js",
                },
                name: "@scope/dep-wildcard",
                type: "module",
            });
            await writeFile(join(temporaryDirectoryPath, "node_modules", "@scope", "dep-wildcard", "dist", "utils.js"), 'export const value = "scoped-hello";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "@scope/dep-wildcard": "*",
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("scoped-hello");
        });

        it("should resolve .mjs bare specifier through exports map with wildcards", async () => {
            expect.assertions(3);

            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import { value } from 'dep-mjs/utils.mjs';
console.log(value);
`,
            );

            await writeJson(join(temporaryDirectoryPath, "node_modules", "dep-mjs", "package.json"), {
                exports: {
                    "./*": "./dist/*",
                },
                name: "dep-mjs",
                type: "module",
            });
            await writeFile(join(temporaryDirectoryPath, "node_modules", "dep-mjs", "dist", "utils.mjs"), 'export const value = "from-mjs";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "dep-mjs": "*",
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("from-mjs");
        });

        it("should prefer .js over .ts for bare specifier imports", async () => {
            expect.assertions(4);

            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import { value } from 'dep-both/file.js';
console.log(value);
`,
            );

            await writeJson(join(temporaryDirectoryPath, "node_modules", "dep-both", "package.json"), {
                main: "./index.js",
                name: "dep-both",
                type: "module",
            });
            await writeFile(join(temporaryDirectoryPath, "node_modules", "dep-both", "file.js"), 'export const value = "compiled-js";');
            await writeFile(join(temporaryDirectoryPath, "node_modules", "dep-both", "file.ts"), 'export const value: string = "source-ts";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "dep-both": "*",
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("compiled-js");
            expect(content).not.toMatch("source-ts");
        });

        it("should fallback bare specifier .js to .ts when only .ts exists", async () => {
            expect.assertions(3);

            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `import { value } from 'dep-ts-only/file.js';
console.log(value);
`,
            );

            await writeJson(join(temporaryDirectoryPath, "node_modules", "dep-ts-only", "package.json"), {
                main: "./index.js",
                name: "dep-ts-only",
                type: "module",
            });
            await writeFile(join(temporaryDirectoryPath, "node_modules", "dep-ts-only", "file.ts"), 'export const value: string = "only-ts";');

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    "dep-ts-only": "*",
                    typescript: "*",
                },
                main: "./dist/index.js",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

            expect(content).toMatch("only-ts");
        });
    });

    describe("resolve-typescript-tsconfig-paths plugin", () => {
        it("should resolve tsconfig paths", async () => {
            expect.assertions(5);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                'import "components:Test";\n import { test2 } from "components:Test2";\n\nconsole.log(test2);',
            );
            await writeFile(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");
            await writeFile(`${temporaryDirectoryPath}/src/components/Test2.ts`, "export const test2 = 'test'");

            await createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    baseUrl: "src",
                    paths: {
                        "components:*": ["components/*.ts"],
                    },
                },
            });
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).not.toContain("If this is incorrect, add it to the");

            const cjs = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjs).toMatchSnapshot("cjs code output");

            const mjs = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjs).toMatchSnapshot("mjs code output");
        });

        it.each([
            ["@/", "@/*", false],
            ["#/", "#/*", false],
            ["~/", "~/*", false],
            ["/", "/*", true],
        ])("should resolve tsconfig paths with a '%s'", async (namespace, patchKey, resolveAbsolutePath) => {
            expect.assertions(5);

            await writeFile(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");
            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `import "${namespace as string}Test";`);

            await installPackage(temporaryDirectoryPath, "typescript");
            await createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    baseUrl: "src",
                    paths: {
                        [patchKey as string]: ["components/*.ts"],
                    },
                },
            });
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    rollup: {
                        tsconfigPaths: { resolveAbsolutePath },
                    },
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).not.toContain("If this is incorrect, add it to the");

            const cjs = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjs).toBe(`'use strict';

console.log(1);
`);

            const mjs = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjs).toBe(`console.log(1);
`);
        });
    });

    describe("resolve-typescript-tsconfig-root-dirs plugin", () => {
        it("should resolve tsconfig rootDirs", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, 'import { b } from "./bb";\n\nconsole.log(b);');
            await writeFile(`${temporaryDirectoryPath}/tt/a/aa.ts`, "export const a = 1;");
            await writeFile(`${temporaryDirectoryPath}/tt/b/bb.ts`, 'import { a } from "./aa";\nnconsole.log(a);\n\nexport const b = 2;');

            await createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    rootDir: ".",
                    rootDirs: ["src", "tt/b", "tt/a"],
                },
            });
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const cjs = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjs).toBe(`'use strict';

const a = 1;

nconsole.log(a);
const b = 2;

console.log(b);
`);

            const mjs = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjs).toBe(`const a = 1;

nconsole.log(a);
const b = 2;

console.log(b);
`);
        });
    });

    it("should support typescript decorator", async () => {
        expect.assertions(4);

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `
function first() {
  console.log("first(): factory evaluated");
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    console.log("first(): called");
  };
}

export class ExampleClass {
  @first()
  public readonly value!: string;
}`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                experimentalDecorators: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toMatchSnapshot("mjs code output");

        const cjs = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toMatchSnapshot("cjs code output");
    });

    it('should allow support for "allowJs" and generate proper assets', async () => {
        expect.assertions(4);

        await writeFile(`${temporaryDirectoryPath}/src/index.js`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowJs: true,
                baseUrl: "./",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.js",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        expect(cjsContent).toMatchSnapshot("cjs code output");

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toMatchSnapshot("ts type code output");
    });

    it("should output correct bundles and types import json with export condition", async () => {
        expect.assertions(4);

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import pkgJson from '../package.json'

export const version = pkgJson.version;
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.js",
                    types: "./dist/index.d.ts",
                },
            },
            type: "module",
            version: "0.0.1",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dMtsContent).toBe(`declare const version: string;
export { version };
`);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        expect(dCtsContent).toBe(`var version$1 = "0.0.1";
const pkgJson = {
	version: version$1};

const version = pkgJson.version;

export { version };
`);
    });

    it("should work with tsconfig 'incremental' option", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { incremental: true },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;
export { _default as default };
`);

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;
export = _default;
`);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(dCtsContent).toBe(`const index = () => "index";

export { index as default };
`);

        expect(existsSync(join(temporaryDirectoryPath, ".tsbuildinfo"))).toBe(false);
    });

    it("should work with tsconfig 'incremental' and 'tsBuildInfoFile' option", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                incremental: true,
                tsBuildInfoFile: ".tsbuildinfo",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;
export { _default as default };
`);

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;
export = _default;
`);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(dCtsContent).toBe(`const index = () => "index";

export { index as default };
`);

        expect(existsSync(join(temporaryDirectoryPath, ".tsbuildinfo"))).toBe(false);
    });

    it("should work with tsconfig 'noEmit' option", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.js",
                    types: "./dist/index.d.ts",
                },
            },
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                noEmit: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mjsContent).toBe(`const index = () => "index";

export { index as default };
`);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;
export { _default as default };
`);
    });

    it("should work with symlink dependencies", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { fn } from 'dep-a';

export default fn({ value: 1 });`,
        );

        const depAIndexDtsPath = `${temporaryDirectoryPath}/store/dep-a/index.d.ts`;

        await writeFile(depAIndexDtsPath, `export * from 'dep-b';`);
        await writeFile(
            `${temporaryDirectoryPath}/store/dep-a/node_modules/dep-b/index.d.ts`,
            `type data = {
    value: number;
};

export declare function fn(a: data): data;
    `,
        );

        await writeJson(join(temporaryDirectoryPath, "node_modules", "dep-a", "package.json"), { main: "index.js", name: "dep-a" });
        await writeFile(join(temporaryDirectoryPath, "node_modules", "dep-a", "index.js"), "console.log('dep-a');");

        symlinkSync(depAIndexDtsPath, join(temporaryDirectoryPath, "node_modules", "dep-a", "index.d.ts"));

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.js",
            peerDependencies: {
                "dep-a": "*",
            },
            type: "module",
            types: "./dist/index.d.ts",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                noEmit: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", ["--debug"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dMtsContent).toBe(`import * as _$dep_a0 from 'dep-a';
declare const _default: _$dep_a0.data;
export { _default as default };
`);
    });

    it("should automatically convert imports with .ts extension", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/utils/one.ts`, `export const one = 1`);
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export async function getOne() {
  return await import('./utils/one.ts').then(m => m.one)
}`,
        );
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
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowImportingTsExtensions: true,
                module: "esnext",
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`async function getOne() {
  return await import('./packem_chunks/one.mjs').then((m) => m.one);
}

export { getOne };
`);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare function getOne(): Promise<number>;
export { getOne };
`);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

async function getOne() {
  return await import('./packem_chunks/one.cjs').then((m) => m.one);
}

exports.getOne = getOne;
`);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function getOne(): Promise<number>;
export { getOne };
`);
    });

    it("should automatically convert dynamic imports with .ts extension to cjs or mjs", async () => {
        expect.assertions(9);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/utils/one.ts`, `export const one = 1`);
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export async function getOne() {
  const path = 'one'
  return await import(\`./utils/\${path}.ts\`).then(m => m.one)
}`,
        );
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
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowImportingTsExtensions: true,
                module: "esnext",
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(binProcess.stdout).toContain("dynamic imports:");
        expect(binProcess.stdout).toContain("└─ dist/packem_chunks/one.mjs");
        expect(binProcess.stdout).toContain("└─ dist/packem_chunks/one.cjs");

        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`function __variableDynamicImportRuntime0__(path) {
  switch (path) {
    case './utils/one.ts': return import('./packem_chunks/one.mjs');
    default: return new Promise(function(resolve, reject) {
      (typeof queueMicrotask === 'function' ? queueMicrotask : setTimeout)(
        reject.bind(null, new Error("Unknown variable dynamic import: " + path))
      );
    })
   }
 }

async function getOne() {
  const path = "one";
  return await __variableDynamicImportRuntime0__(\`./utils/\${path}.ts\`).then((m) => m.one);
}

export { getOne };
`);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare function getOne(): Promise<any>;
export { getOne };
`);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function __variableDynamicImportRuntime0__(path) {
  switch (path) {
    case './utils/one.ts': return import('./packem_chunks/one.cjs');
    default: return new Promise(function(resolve, reject) {
      (typeof queueMicrotask === 'function' ? queueMicrotask : setTimeout)(
        reject.bind(null, new Error("Unknown variable dynamic import: " + path))
      );
    })
   }
 }

async function getOne() {
  const path = "one";
  return await __variableDynamicImportRuntime0__(\`./utils/\${path}.ts\`).then((m) => m.one);
}

exports.getOne = getOne;
`);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function getOne(): Promise<any>;
export { getOne };
`);
    });

    it("should not automatically convert dynamic imports when 'ts' is in the name", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/node_modules/@eslint-community/eslint-plugin-eslint-comments/index.js`, `export const one = 1`);
        await writeFile(`${temporaryDirectoryPath}/node_modules/@eslint-community/eslint-plugin-eslint-comments/package.json`, `{ "main": "index.js" }`);
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export async function test() {
  return await import("@eslint-community/eslint-plugin-eslint-comments")
}`,
        );
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
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowImportingTsExtensions: true,
                module: "esnext",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                externals: ["@eslint-community/eslint-plugin-eslint-comments"],
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`async function test() {
  return await import('@eslint-community/eslint-plugin-eslint-comments');
}

export { test };
`);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare function test(): Promise<any>;
export { test };
`);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

async function test() {
  return await import('@eslint-community/eslint-plugin-eslint-comments');
}

exports.test = test;
`);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function test(): Promise<any>;
export { test };
`);
    });

    it(
        "should contain correct type file path of shared chunks",
        {
            retry: 3,
        },
        async () => {
            expect.assertions(13);

            await installPackage(temporaryDirectoryPath, "typescript");
            await installPackage(temporaryDirectoryPath, "react");

            await writeFile(`${temporaryDirectoryPath}/src/another.ts`, `export { sharedApi as anotherSharedApi } from './lib/util.shared-runtime'`);
            await writeFile(`${temporaryDirectoryPath}/src/index.react-server.ts`, `export { AppContext } from './lib/app-context.shared-runtime'`);
            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `export const index = 'index'
export { sharedApi } from './lib/util.shared-runtime'
export { AppContext } from './lib/app-context.shared-runtime'
`,
            );
            await writeFile(
                `${temporaryDirectoryPath}/src/lib/app-context.shared-runtime.ts`,
                `'use client'

import React from 'react'

export const AppContext = React.createContext(void 0)`,
            );
            await writeFile(
                `${temporaryDirectoryPath}/src/lib/util.shared-runtime.ts`,
                `export function sharedApi() {
  return 'common:shared'
}`,
            );

            await createPackageJson(temporaryDirectoryPath, {
                dependencies: {
                    react: "*",
                },
                devDependencies: {
                    typescript: "*",
                },
                exports: {
                    ".": {
                        default: "./dist/index.cjs",
                        import: "./dist/index.mjs",
                        "react-server": "./dist/index.react-server.mjs",
                        types: "./dist/index.d.ts",
                    },
                    "./another": {
                        default: "./dist/another.cjs",
                        import: "./dist/another.mjs",
                        types: "./dist/another.d.ts",
                    },
                },
                name: "shared-module",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    noEmit: true,
                },
            });
            await createPackemConfig(temporaryDirectoryPath, {
                runtime: "browser",
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const mjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);
            const mjsMatches: string[] = getRegexMatches(/from\s'.*';/g, mjsContent);

            expect(mjsMatches).toHaveLength(2);
            expect(mjsContent).toBe(`export { sharedApi } ${mjsMatches[0] as string}
export { AppContext } ${mjsMatches[1] as string}

const index = "index";

export { index };
`);

            const mjsChunk1Content = await readFile(`${temporaryDirectoryPath}/dist/${(mjsMatches[0] as string).replace("from './", "").replace("';", "")}`);

            expect(mjsChunk1Content).toBe(`function sharedApi() {
  return "common:shared";
}

export { sharedApi };
`);

            const mjsChunk2Content = await readFile(`${temporaryDirectoryPath}/dist/${(mjsMatches[1] as string).replace("from './", "").replace("';", "")}`);

            expect(mjsChunk2Content).toBe(`'use client';
import React from 'react';

const AppContext = React.createContext(void 0);

export { AppContext };
`);

            const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);
            const cjsMatches: string[] = getRegexMatches(/require\('.*'\);/g, cjsContent);

            const hasAnotherSharedApi = cjsContent.includes("anotherSharedApi");

            expect(cjsMatches).toHaveLength(2);
            expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const ${hasAnotherSharedApi ? "anotherSharedApi" : "sharedApi"} = ${cjsMatches[0] as string}
const AppContext = ${cjsMatches[1] as string}

const index = "index";

exports.sharedApi = ${hasAnotherSharedApi ? "anotherSharedApi" : "sharedApi"}.sharedApi;
exports.AppContext = AppContext.AppContext;
exports.index = index;
`);

            const cjsChunk1Content = await readFile(
                `${temporaryDirectoryPath}/dist/${(cjsMatches[0] as string).replace("require('./", "").replace("');", "")}`,
            );

            expect(cjsChunk1Content).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function sharedApi() {
  return "common:shared";
}

exports.sharedApi = sharedApi;
`);

            const cjsChunk2Content = await readFile(
                `${temporaryDirectoryPath}/dist/${(cjsMatches[1] as string).replace("require('./", "").replace("');", "")}`,
            );

            expect(cjsChunk2Content).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const React = require('react');

const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const React__default = /*#__PURE__*/_interopDefaultCompat(React);

const AppContext = React__default.createContext(void 0);

exports.AppContext = AppContext;
`);

            const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

            expect(dMtsContent).toBe(`export { anotherSharedApi as sharedApi } from "./another.mjs";
declare const AppContext: any;
declare const index = "index";
export { AppContext, index };
`);

            const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

            expect(dCtsContent).toBe(`export { anotherSharedApi as sharedApi } from "./another.cjs";
declare const AppContext: any;
declare const index = "index";
export { AppContext, index };
`);

            const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

            expect(dTsContent).toBe(`export { anotherSharedApi as sharedApi } from "./another.js";
declare const AppContext: any;
declare const index = "index";
export { AppContext, index };
`);
        },
    );

    it("should use the outDir option from tsconfig if present", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                outDir: "lib",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./lib/index.js",
                    types: "./lib/index.d.ts",
                },
            },
            types: "./lib/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/lib/index.js`);

        expect(cjsContent).toBe(`'use strict';

const index = () => "index";

module.exports = index;
`);
    });

    it("should fix dts files for commonjs when cjsInterop is enabled and the file has named exports with default", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `const test = () => {
    return "this should be in final bundle, test function";
};

const test2 = "this should be in final bundle, test2 string";

export { test2, test as default };
`,
        );

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                baseUrl: ".",
                moduleResolution: "bundler",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

const test = () => {
  return "this should be in final bundle, test function";
};
const test2 = "this should be in final bundle, test2 string";

module.exports = test;
module.exports.test2 = test2;
`);

        const cDtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`// @ts-ignore
test;
export { test2 };
declare namespace test {
    export const test: () => string;
    export const test2 = "this should be in final bundle, test2 string";
    import _default = test;
    export { _default as default };
}
export = test;
`);

        const dtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toBe(`// @ts-ignore
test;
export { test2 };
declare namespace test {
    export const test: () => string;
    export const test2 = "this should be in final bundle, test2 string";
    import _default = test;
    export { _default as default };
}
export = test;
`);

        const mDtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";
export { test as default, test2 };
`);
    });

    it("should fix dts files for commonjs when cjsInterop is enabled and the file has named exports with default 2", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `const test = () => {
    return "this should be in final bundle, test function";
};

const test2 = "this should be in final bundle, test2 string";

export default test;
export { test2 };
`,
        );

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                baseUrl: ".",
                moduleResolution: "bundler",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

const test = () => {
  return "this should be in final bundle, test function";
};
const test2 = "this should be in final bundle, test2 string";

module.exports = test;
module.exports.test2 = test2;
`);

        const cDtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`// @ts-ignore
test;
export { test2 };
declare namespace test {
    export const test: () => string;
    export const test2 = "this should be in final bundle, test2 string";
    import _default = test;
    export { _default as default };
}
export = test;
`);

        const dtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toBe(`// @ts-ignore
test;
export { test2 };
declare namespace test {
    export const test: () => string;
    export const test2 = "this should be in final bundle, test2 string";
    import _default = test;
    export { _default as default };
}
export = test;
`);

        const mDtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";
export { test as default, test2 };
`);
    });

    it("should fix dts files for commonjs when cjsInterop is enabled and the file has a default export", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `const test = () => {
    return "this should be in final bundle, test function";
};

export default test;
`,
        );

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                baseUrl: ".",
                moduleResolution: "bundler",
            },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const test = () => {
  return "this should be in final bundle, test function";
};

module.exports = test;
`);

        const cDtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`declare const test: () => string;
export = test;
`);

        const dtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toBe(`declare const test: () => string;
export = test;
`);

        const mDtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`declare const test: () => string;
export { test as default };
`);
    });

    describe("node10 compatibility", () => {
        it("should generate a node10 typesVersions field console info", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export const test = "this should be in final bundle, test2 string";`);
            await writeFile(`${temporaryDirectoryPath}/src/deep/index.ts`, `export const test = "this should be in final bundle, test2 string";`);

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
                    "./deep": {
                        import: {
                            default: "./dist/deep/index.mjs",
                            types: "./dist/deep/index.d.mts",
                        },
                        require: {
                            default: "./dist/deep/index.cjs",
                            types: "./dist/deep/index.d.cts",
                        },
                    },
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`{
    "typesVersions": {
        "*": {
            ".": [
                "./dist/index.d.ts"
            ],
            "deep": [
                "./dist/deep/index.d.ts"
            ]
        }
    }
}`);
        });

        it("should generate a node10 typesVersions field in package.json when node10Compatibility.writeToPackageJson is true", async () => {
            expect.assertions(5);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export const test = "this should be in final bundle, test2 string";`);
            await writeFile(`${temporaryDirectoryPath}/src/deep/index.ts`, `export const test = "this should be in final bundle, test2 string";`);

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
                    "./deep": {
                        import: {
                            default: "./dist/deep/index.mjs",
                            types: "./dist/deep/index.d.mts",
                        },
                        require: {
                            default: "./dist/deep/index.cjs",
                            types: "./dist/deep/index.d.cts",
                        },
                    },
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                    node10Compatibility: {
                        writeToPackageJson: true,
                    },
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`Your package.json "typesVersions" field has been updated.`);

            const fileContent = await readFile(`${temporaryDirectoryPath}/package.json`);
            const packageJson = JSON.parse(fileContent) as PackageJson;

            expect(packageJson.typesVersions).toMatchSnapshot("typesVersions");
        });

        it("should generate a node10 typesVersions field on console with ignored shared files", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/shared/index.ts`, `export const shared = "this should be in final bundle, test2 string";`);
            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `export { shared } from "./shared";
export const test = "this should be in final bundle, test2 string";`,
            );
            await writeFile(
                `${temporaryDirectoryPath}/src/deep/index.ts`,
                `export { shared } from "../shared";
export const test = "this should be in final bundle, test2 string";`,
            );

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
                    "./deep": {
                        import: {
                            default: "./dist/deep/index.mjs",
                            types: "./dist/deep/index.d.mts",
                        },
                        require: {
                            default: "./dist/deep/index.cjs",
                            types: "./dist/deep/index.d.cts",
                        },
                    },
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`{
    "typesVersions": {
        "*": {
            ".": [
                "./dist/index.d.ts"
            ],
            "deep": [
                "./dist/deep/index.d.ts"
            ]
        }
    }
}`);
        });

        it("should generate a node10 typesVersions field on console on array exports", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/shared/index.ts`, `export const shared = "this should be in final bundle, test2 string";`);
            await writeFile(
                `${temporaryDirectoryPath}/src/index.ts`,
                `export { shared } from "./shared";
export const test = "this should be in final bundle, test2 string";`,
            );
            await writeFile(
                `${temporaryDirectoryPath}/src/deep/index.ts`,
                `export { shared } from "../shared";
export const test = "this should be in final bundle, test2 string";`,
            );

            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                exports: ["./dist/index.mjs", "./dist/index.cjs", "./dist/deep/index.cjs", "./dist/deep/index.mjs"],
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
                types: "./dist/index.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`{
    "typesVersions": {
        "*": {
            "*": [
                "./dist/index.d.ts",
                "./dist/deep/index.d.ts"
            ]
        }
    }
}`);
        });

        it("should generate a node10 typesVersions field on console with complex exports", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/index.browser.ts`, `export const browser = "browser";`);
            await writeFile(`${temporaryDirectoryPath}/src/index.server.ts`, `export const server = "server";`);
            await writeFile(`${temporaryDirectoryPath}/src/pail.browser.ts`, `export const browser = "server";`);
            await writeFile(`${temporaryDirectoryPath}/src/pail.server.ts`, `export const server = "server";`);
            await writeFile(`${temporaryDirectoryPath}/src/processor.browser.ts`, `export const browser = "server";`);
            await writeFile(`${temporaryDirectoryPath}/src/processor.server.ts`, `export const server = "server";`);
            await writeFile(`${temporaryDirectoryPath}/src/reporter.browser.ts`, `export const browser = "server";`);
            await writeFile(`${temporaryDirectoryPath}/src/reporter.server.ts`, `export const server = "server";`);

            await createTsConfig(temporaryDirectoryPath);
            await createPackageJson(temporaryDirectoryPath, {
                browser: "dist/index.browser.mjs",
                devDependencies: {
                    typescript: "*",
                },
                exports: {
                    ".": {
                        browser: "./dist/index.browser.mjs",
                        import: {
                            default: "./dist/index.server.mjs",
                            types: "./dist/index.server.d.mts",
                        },
                        require: {
                            default: "./dist/index.server.cjs",
                            types: "./dist/index.server.d.cts",
                        },
                    },
                    "./browser": {
                        import: {
                            default: "./dist/index.browser.mjs",
                            types: "./dist/index.browser.d.mts",
                        },
                        require: {
                            default: "./dist/index.browser.cjs",
                            types: "./dist/index.browser.d.cts",
                        },
                    },
                    "./browser/processor": {
                        browser: "./dist/processor.browser.mjs",
                        import: {
                            default: "./dist/processor.browser.mjs",
                            types: "./dist/processor.browser.d.mts",
                        },
                        require: {
                            default: "./dist/processor.browser.cjs",
                            types: "./dist/processor.browser.d.cts",
                        },
                    },
                    "./browser/reporter": {
                        browser: "./dist/reporter.browser.mjs",
                        import: {
                            default: "./dist/reporter.browser.mjs",
                            types: "./dist/reporter.browser.d.mts",
                        },
                        require: {
                            default: "./dist/reporter.browser.cjs",
                            types: "./dist/reporter.browser.d.cts",
                        },
                    },
                    "./package.json": "./package.json",
                    "./processor": {
                        browser: "./dist/processor.browser.mjs",
                        import: {
                            default: "./dist/processor.server.mjs",
                            types: "./dist/processor.server.d.mts",
                        },
                        require: {
                            default: "./dist/processor.server.cjs",
                            types: "./dist/processor.server.d.cts",
                        },
                    },
                    "./reporter": {
                        browser: "./dist/reporter.browser.mjs",
                        import: {
                            default: "./dist/reporter.server.mjs",
                            types: "./dist/reporter.server.d.mts",
                        },
                        require: {
                            default: "./dist/reporter.server.cjs",
                            types: "./dist/reporter.server.d.cts",
                        },
                    },
                    "./server": {
                        import: {
                            default: "./dist/index.server.mjs",
                            types: "./dist/index.server.d.mts",
                        },
                        require: {
                            default: "./dist/index.server.cjs",
                            types: "./dist/index.server.d.cts",
                        },
                    },
                    "./server/processor": {
                        import: {
                            default: "./dist/processor.server.mjs",
                            types: "./dist/processor.server.d.mts",
                        },
                        require: {
                            default: "./dist/processor.server.cjs",
                            types: "./dist/processor.server.d.cts",
                        },
                    },
                    "./server/reporter": {
                        import: {
                            default: "./dist/reporter.server.mjs",
                            types: "./dist/reporter.server.d.mts",
                        },
                        require: {
                            default: "./dist/reporter.server.cjs",
                            types: "./dist/reporter.server.d.cts",
                        },
                    },
                },
                main: "dist/index.server.cjs",
                module: "dist/index.server.mjs",
                types: "dist/index.server.d.ts",
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`{
    "typesVersions": {
        "*": {
            ".": [
                "./dist/index.browser.d.ts",
                "./dist/index.server.d.ts"
            ],
            "browser": [
                "./dist/index.browser.d.ts"
            ],
            "server": [
                "./dist/index.server.d.ts"
            ],
            "browser/processor": [
                "./dist/processor.browser.d.ts"
            ],
            "processor": [
                "./dist/processor.browser.d.ts",
                "./dist/processor.server.d.ts"
            ],
            "browser/reporter": [
                "./dist/reporter.browser.d.ts"
            ],
            "reporter": [
                "./dist/reporter.browser.d.ts",
                "./dist/reporter.server.d.ts"
            ],
            "server/processor": [
                "./dist/processor.server.d.ts"
            ],
            "server/reporter": [
                "./dist/reporter.server.d.ts"
            ]
        }
    }
}`);
        });

        it("should generate a node10 typesVersions field on console with complex exports 2", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            await writeFile(`${temporaryDirectoryPath}/src/is-color-supported.edge-light.ts`, `export const browser = "edge-light";`);
            await writeFile(`${temporaryDirectoryPath}/src/is-color-supported.browser.ts`, `export const browser = "browser";`);
            await writeFile(`${temporaryDirectoryPath}/src/is-color-supported.server.ts`, `export const server = "server";`);

            await createTsConfig(temporaryDirectoryPath);
            /* eslint-disable perfectionist/sort-objects */
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                exports: {
                    ".": {
                        "edge-light": {
                            types: "./dist/is-color-supported.edge-light.d.mts",
                            default: "./dist/is-color-supported.edge-light.mjs",
                        },
                        browser: {
                            types: "./dist/is-color-supported.browser.d.mts",
                            default: "./dist/is-color-supported.browser.mjs",
                        },
                        require: {
                            types: "./dist/is-color-supported.server.d.cts",
                            default: "./dist/is-color-supported.server.cjs",
                        },
                        import: {
                            types: "./dist/is-color-supported.server.d.mts",
                            default: "./dist/is-color-supported.server.mjs",
                        },
                    },
                    "./server": {
                        require: {
                            types: "./dist/is-color-supported.server.d.cts",
                            default: "./dist/is-color-supported.server.cjs",
                        },
                        import: {
                            types: "./dist/is-color-supported.server.d.mts",
                            default: "./dist/is-color-supported.server.mjs",
                        },
                    },
                    "./browser": {
                        require: {
                            types: "./dist/is-color-supported.browser.d.cts",
                            default: "./dist/is-color-supported.browser.cjs",
                        },
                        import: {
                            types: "./dist/is-color-supported.browser.d.mts",
                            default: "./dist/is-color-supported.browser.mjs",
                        },
                    },
                    "./edge-light": {
                        require: {
                            types: "./dist/is-color-supported.edge-light.d.cts",
                            default: "./dist/is-color-supported.edge-light.cjs",
                        },
                        import: {
                            types: "./dist/is-color-supported.edge-light.d.mts",
                            default: "./dist/is-color-supported.edge-light.mjs",
                        },
                    },
                    "./package.json": "./package.json",
                },
                main: "dist/is-color-supported.server.cjs",
                module: "dist/is-color-supported.server.mjs",
                browser: "./dist/is-color-supported.browser.mjs",
                types: "dist/is-color-supported.server.d.ts",
            });
            /* eslint-enable perfectionist/sort-objects */
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                },
            });

            const binProcess = await execPackem("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`{
    "typesVersions": {
        "*": {
            ".": [
                "./dist/is-color-supported.edge-light.d.ts",
                "./dist/is-color-supported.browser.d.ts",
                "./dist/is-color-supported.server.d.ts"
            ],
            "edge-light": [
                "./dist/is-color-supported.edge-light.d.ts"
            ],
            "browser": [
                "./dist/is-color-supported.browser.d.ts"
            ],
            "server": [
                "./dist/is-color-supported.server.d.ts"
            ]
        }
    }
}`);
        });
    });

    it("should use the exports key from package.json if declaration are off", async () => {
        expect.assertions(4);

        await writeFile(`${temporaryDirectoryPath}/src/config/index.ts`, `export default () => 'index';`);
        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        await writeFile(`${temporaryDirectoryPath}/src/config.ts`, `export default () => 'config';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                declaration: false,
            },
        });
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
                "./config": {
                    import: {
                        default: "./dist/config.mjs",
                        types: "./dist/config.d.mts",
                    },
                    require: {
                        default: "./dist/config.cjs",
                        types: "./dist/config.d.cts",
                    },
                },
            },
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = await readFile(`${temporaryDirectoryPath}/dist/config.cjs`);

        expect(cjs).toBe(`'use strict';

const config = () => "config";

module.exports = config;
`);

        const mjs = await readFile(`${temporaryDirectoryPath}/dist/config.mjs`);

        expect(mjs).toBe(`const config = () => "config";

export { config as default };
`);
    });

    // This test is connected to the caching of the @rollup/plugin-node-resolve
    it("should bundle deeks package", async () => {
        expect.assertions(9);

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export type { DeeksOptions as DeepKeysOptions } from "deeks";
export { deepKeys, deepKeysFromList } from "deeks";`,
        );

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                deeks: "*",
                typescript: "*",
            },
            main: "dist/index.cjs",
            module: "dist/index.mjs",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "deeks");

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // deeks is a devDep the JS build bundles, so packem auto-inlines its types into
        // the emitted .d.ts (matching the JS bundling decision — see computeDtsResolve).
        // Consumers shouldn't need `deeks` in their own node_modules to type-check.
        expect(dMtsContent).toMatch(/^interface DeeksOptions\b/m);
        expect(dMtsContent).toMatch(/declare function deepKeys\b/);
        expect(dMtsContent).toMatch(/declare function deepKeysFromList\b/);
        expect(dMtsContent).not.toMatch(/from ["']deeks["']/);

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(dMtsContent);

        const ctsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(ctsContent).toMatchSnapshot("cjs content");

        const mtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(mtsContent).toMatchSnapshot("mjs content");
    });

    it("should compile only a type file", async () => {
        expect.assertions(3);

        await writeFile(
            `${temporaryDirectoryPath}/src/native-string-types.d.ts`,
            `
declare global {
    interface String {

    }
}
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                "./native-string-types": {
                    types: "./native-string-types.d.ts",
                },
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.ts`);

        expect(dTsContent).toMatchSnapshot(".d.ts type code output");
    });

    it("should compile a .d.ts file into .d.cts and .d.mts", async () => {
        expect.assertions(5);

        await writeFile(
            `${temporaryDirectoryPath}/src/native-string-types.d.ts`,
            `
declare global {
    interface String {

    }
}

export type NativeStringTypes = string;
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                "./native-string-types": {
                    import: {
                        types: "./native-string-types.d.mts",
                    },
                    require: {
                        types: "./native-string-types.d.cts",
                    },
                },
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.cts`);

        expect(dCtsContent).toMatchSnapshot(".d.cts type code output");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.mts`);

        expect(dMtsContent).toMatchSnapshot(".d.mts type code output");

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.ts`);

        expect(dTsContent).toMatchSnapshot(".d.ts type code output");
    });

    it("should compile a .d.ts file into .d.cts and .d.mts, with other exports", async () => {
        expect.assertions(10);

        await writeFile(
            `${temporaryDirectoryPath}/src/native-string-types.d.ts`,
            `
declare global {
    interface String {

    }
}

export type NativeStringTypes = string;
`,
        );
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Fast lookup tables for performance optimization
const isUpperCode = new Uint8Array(128);
const isLowerCode = new Uint8Array(128);
const isDigitCode = new Uint8Array(128);

// Initialize lookup tables once
for (let index = 0; index < 128; index++) {
    isUpperCode[index] = index >= 65 && index <= 90 ? 1 : 0; // A-Z
    isLowerCode[index] = index >= 97 && index <= 122 ? 1 : 0; // a-z
    isDigitCode[index] = index >= 48 && index <= 57 ? 1 : 0; // 0-9
}

export { isUpperCode, isLowerCode, isDigitCode };
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                "./index": {
                    import: {
                        default: "./index.mjs",
                        types: "./index.d.mts",
                    },
                    require: {
                        default: "./index.cjs",
                        types: "./index.d.cts",
                    },
                },
                "./native-string-types": {
                    import: {
                        types: "./native-string-types.d.mts",
                    },
                    require: {
                        types: "./native-string-types.d.cts",
                    },
                },
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.cts`);

        expect(dCtsContent).toMatchSnapshot(".d.cts type code output");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.mts`);

        expect(dMtsContent).toMatchSnapshot(".d.mts type code output");

        const dTsContent = await readFile(`${temporaryDirectoryPath}/dist/native-string-types.d.ts`);

        expect(dTsContent).toMatchSnapshot(".d.ts type code output");

        const cjsIndexContent = await readFile(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsIndexContent).toMatchSnapshot("cjs content");

        const mjsIndexContent = await readFile(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsIndexContent).toMatchSnapshot("mjs content");

        const dTsIndexContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsIndexContent).toMatchSnapshot("d.ts content");

        const dCtsIndexContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsIndexContent).toMatchSnapshot("d.cts content");

        const dMtsIndexContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsIndexContent).toMatchSnapshot("d.mts content");
    });

    it("should preserve sourcemap line mappings with comments and blank lines", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            `// Line 1
// Line 2
// Line 3
// Line 4
// Line 5
// Line 6
// Line 7
// Line 8
throw new Error('line 9');
`,
        );

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            module: "dist/index.mjs",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                sourcemap: true,
            },
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // Run the built output with --enable-source-maps and verify the stack trace shows the correct source line
        const { stderr } = await execa("node", ["--enable-source-maps", "dist/index.mjs"], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        // Stack trace should reference line 9, not line 1 (which would happen if sourcemaps were missing from the TS transform step)
        expect(stderr).toMatch(/index\.ts:9/);
        expect(stderr).not.toMatch(/index\.ts:1[^0-9]/);
    });

    it("should inline a devDep's types in .d.ts when the JS build bundles the devDep", async () => {
        expect.assertions(4);

        // Reproduces the @visulima/string vs @visulima/tabular interaction: packem bundles
        // devDeps in the JS build by default, but historically the DTS build kept them
        // external — so `export { type X, default as y } from "some-devdep"` produced a .js
        // that inlines `y` from packem_shared/ while the paired .d.ts still points at
        // "some-devdep". Consumers then pull the transitive specifier into their own build
        // and get "Inlined implicit external" / "shamefully hoisted" warnings for packages
        // that are not runtime deps of the package they imported from.
        const devDepRoot = `${temporaryDirectoryPath}/node_modules/fake-bundled-devdep`;

        await writeFile(
            `${devDepRoot}/package.json`,
            // `types` must be listed before `default` — Node.js exports resolution picks the
            // first matching condition in object order, so if default comes first we'd get
            // `./index.js` back even when asking for the types condition.
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-bundled-devdep",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(`${devDepRoot}/index.js`, "export default function work(value) { return value; }\n");
        await writeFile(
            `${devDepRoot}/index.d.ts`,
            "export interface WorkOptions { verbose?: boolean }\ndeclare function work(value: string): string;\nexport default work;\n",
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { type WorkOptions, default as work } from "fake-bundled-devdep";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-bundled-devdep": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // The devDep's types must be inlined — no bare specifier left in the emitted .d.ts.
        expect(dMtsContent).not.toContain('from "fake-bundled-devdep"');
        expect(dMtsContent).not.toContain("from 'fake-bundled-devdep'");
        // The re-exported symbols should still be present (inlined, not dropped).
        expect(dMtsContent).toMatch(/WorkOptions/);
    });

    it("should keep unused devDep types external in .d.ts (build-time-only devDeps are not auto-inlined)", async () => {
        expect.assertions(3);

        // Counterpart to the test above: devDeps that the JS build never bundles
        // (because src never imports them) must not be auto-inlined. If they were,
        // build-time-only devDeps like typescript/eslint/type-fest used for local
        // casts would leak into every emitted .d.ts. We only inline devDeps that
        // show up in `context.usedDependencies` — i.e. the JS build actually reached
        // them — to match the JS build's bundling decisions.
        const usedDepRoot = `${temporaryDirectoryPath}/node_modules/fake-used-devdep`;

        await writeFile(
            `${usedDepRoot}/package.json`,
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-used-devdep",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(`${usedDepRoot}/index.js`, "export default function used(value) { return value; }\n");
        await writeFile(
            `${usedDepRoot}/index.d.ts`,
            "export interface UsedOptions { verbose?: boolean }\ndeclare function used(value: string): string;\nexport default used;\n",
        );

        // Declared but never imported anywhere — simulates the "long tail" of
        // build-time-only devDeps (typescript, eslint, type-fest used only for casts …).
        const unusedDepRoot = `${temporaryDirectoryPath}/node_modules/fake-unused-devdep`;

        await writeFile(
            `${unusedDepRoot}/package.json`,
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-unused-devdep",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(`${unusedDepRoot}/index.js`, "export default function unused(value) { return value; }\n");
        await writeFile(
            `${unusedDepRoot}/index.d.ts`,
            "export interface UnusedOptions { verbose?: boolean }\ndeclare function unused(value: string): string;\nexport default unused;\n",
        );

        // src only uses fake-used-devdep; fake-unused-devdep is declared but never imported.
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { type UsedOptions, default as used } from "fake-used-devdep";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-unused-devdep": "*",
                "fake-used-devdep": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // fake-used-devdep is bundled by JS → its types are inlined in .d.mts.
        expect(dMtsContent).not.toMatch(/from ["']fake-used-devdep["']/);
        // fake-unused-devdep is declared but never imported → never ends up in the auto-inline list.
        // This guards against regressions where we'd iterate pkg.devDependencies unconditionally.
        expect(dMtsContent).not.toMatch(/fake-unused-devdep/);
    });

    it("should keep a devDep+peerDep external in .d.ts (JS externalizes peer deps, so DTS must match)", async () => {
        expect.assertions(4);

        // Repro for the zod-in-connect / yaml-in-fs failure: when a package declares the
        // same name in BOTH devDependencies (needed for local build) AND peerDependencies
        // (consumer provides at install-time), the JS build externalizes it. The emitted
        // .d.ts must externalize it too — otherwise we bundle the dep's .d.ts, which can
        // hit TS declaration-merging patterns (e.g. `export interface X` + `export const X`)
        // that produce duplicate ES-module exports rollup rejects.
        const peerDepRoot = `${temporaryDirectoryPath}/node_modules/fake-peer-devdep`;

        await writeFile(
            `${peerDepRoot}/package.json`,
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-peer-devdep",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(`${peerDepRoot}/index.js`, "export function parse(value) { return value; }\n");
        await writeFile(
            `${peerDepRoot}/index.d.ts`,
            "export declare function parse(value: string): string;\nexport declare namespace parse { const FLAG: unique symbol; }\n",
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { parse } from "fake-peer-devdep";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-peer-devdep": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            peerDependencies: {
                "fake-peer-devdep": "*",
            },
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // peer-devdep types must stay external — consumer installs the package, gets types from there.
        expect(dMtsContent).toMatch(/from ["']fake-peer-devdep["']/);
        // Primary symbol is re-exported, not inlined.
        expect(dMtsContent).toMatch(/\bparse\b/);
        // And no evidence of the dep's types being bundled in.
        expect(dMtsContent).not.toMatch(/declare namespace parse/);
    });

    it("should externalize a types-only devDep (no JS entry in exports) in .d.ts build", async () => {
        expect.assertions(4);

        // Repro for type-fest in @visulima/inspector: devDep that ships only `.d.ts` files
        // (no JS entry in its `exports` field). Pre-fix, the externals plugin tried to
        // node-resolve its JS entry in DTS mode and blew up because no JS entry exists.
        // The DTS resolver is meant to handle types-only packages by externalizing them —
        // the consumer installs the package from npm, TypeScript finds the .d.ts there.
        const typesOnlyRoot = `${temporaryDirectoryPath}/node_modules/fake-types-only`;

        await writeFile(
            `${typesOnlyRoot}/package.json`,
            // No `default`/`import`/`require` — only types. This is the type-fest shape.
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts" } },
                name: "fake-types-only",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(
            `${typesOnlyRoot}/index.d.ts`,
            "export type LiteralUnion<T extends string, U extends string = string> = T | (U & Record<never, never>);\n",
        );

        // Type-only import from .ts source — the JS build drops it (erased at transform),
        // so `context.usedDependencies` never sees the package. The DTS build still needs
        // to emit a reference to it and must not try to bundle the non-existent JS entry.
        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            [
                'import type { LiteralUnion } from "fake-types-only";',
                "",
                'export type Color = LiteralUnion<"red" | "green" | "blue">;',
                "",
                "export function render(color: Color): string {",
                "    return String(color);",
                "}",
                "",
            ].join("\n"),
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-types-only": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        // `dts.oxc: true` mirrors the real-world config that triggered the regression
        // (e.g. @visulima/inspector) — `type-fest`-style types-only packages must not
        // be routed through the JS node-resolve path in either resolver mode.
        await createPackemConfig(temporaryDirectoryPath, { config: { rollup: { dts: { oxc: true } } } });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).not.toContain("Could not resolve import");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // Externalized — specifier preserved in the emitted .d.ts.
        expect(dMtsContent).toMatch(/from ["']fake-types-only["']/);
        // Used type chain survives.
        expect(dMtsContent).toMatch(/\bColor\b/);
    });

    it("should pass the correct dtsResolve list to each build when usedDependencies changes mid-run", async () => {
        expect.assertions(3);

        // Repro for the memoization bug: `createDtsPlugin` was cached by
        // `${process.pid}:${tsconfigPath}` alone. Sibling DTS builds in the same
        // process (e.g. inspector's browser+node runtimes) share the same key but
        // can see different `usedDependencies` snapshots when `computeDtsResolve`
        // runs — the first build's stale list was re-used, so direct-bypass never
        // fired for devDeps the JS build discovered later.
        //
        // Emitting dual CJS+ESM is enough to trip the original cache (two DTS
        // outputs, same tsconfig) — the fix hashes `dtsResolve` into the key.
        const devDepRoot = `${temporaryDirectoryPath}/node_modules/fake-dual-dep`;

        await writeFile(
            `${devDepRoot}/package.json`,
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-dual-dep",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(`${devDepRoot}/index.js`, "export function sign(v) { return v; }\n");
        await writeFile(
            `${devDepRoot}/index.d.ts`,
            "export interface DualOptions { verbose?: boolean }\nexport declare function sign(value: string): string;\n",
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { type DualOptions, sign } from "fake-dual-dep";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-dual-dep": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);

        // Both DTS outputs must inline the devDep's types — if the cached plugin
        // carried a stale (empty) resolve list for the second build, the second
        // output would keep the bare specifier.
        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);
        const dCtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dMtsContent).not.toMatch(/from ["']fake-dual-dep["']/);
        expect(dCtsContent).not.toMatch(/from ["']fake-dual-dep["']/);
    });

    it("should inline types for a bundled devDep whose package.json has `exports: \"./index.js\"` (no types condition)", async () => {
        expect.assertions(3);

        // Repro for @visulima/string's `indent-string`/`redent`/`strip-indent`
        // interaction with @visulima/tabular: old-style sindresorhus packages
        // ship ESM with just `exports: "./index.js"` (a string, no types
        // condition) + a sibling `index.d.ts`. The JS build happily inlines
        // them, but oxc-resolver's DTS pass (conditions [types, typings,
        // import, require]) falls through to the .js file because the exports
        // string doesn't go through conditional resolution — leaving the
        // emitted .d.ts to import the bare specifier, which then triggers
        // "shamefully hoisted" warnings at downstream consumers.
        const devDepRoot = `${temporaryDirectoryPath}/node_modules/fake-exports-string`;

        await writeFile(
            `${devDepRoot}/package.json`,
            // Exact shape of the sindresorhus packages: string exports, no types
            // condition, sibling `index.d.ts` by convention.
            JSON.stringify({
                exports: "./index.js",
                main: "./index.js",
                name: "fake-exports-string",
                type: "module",
                version: "1.0.0",
            }),
        );
        await writeFile(`${devDepRoot}/index.js`, "export default function work(value) { return value; }\n");
        await writeFile(
            `${devDepRoot}/index.d.ts`,
            "export interface WorkOptions { verbose?: boolean }\ndeclare function work(value: string): string;\nexport default work;\n",
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { type WorkOptions, default as work } from "fake-exports-string";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-exports-string": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // Sibling .d.ts types inlined — no bare specifier in the emitted .d.ts.
        expect(dMtsContent).not.toMatch(/from ["']fake-exports-string["']/);
        // Inlined symbols survive.
        expect(dMtsContent).toMatch(/\bWorkOptions\b/);
    });

    it("should externalize transitive bare specifiers when bundling a node_modules .d.ts", async () => {
        expect.assertions(3);

        // Repro for the type-fest → tagged-tag crash: when the DTS build inlines
        // a package's types and that package's `.d.ts` pulls in its OWN transitive
        // imports (often types-only themselves), those specifiers must be
        // externalized — we can't route them through node-resolve because the
        // transitive package may not be installed at the consumer or may have no
        // JS entry in its exports. The importer-is-in-node_modules check is what
        // flags these cases.
        const bundledRoot = `${temporaryDirectoryPath}/node_modules/fake-bundled-with-transitive`;

        await writeFile(
            `${bundledRoot}/package.json`,
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-bundled-with-transitive",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(`${bundledRoot}/index.js`, "export function work(v) { return v; }\n");
        await writeFile(
            `${bundledRoot}/index.d.ts`,
            // Transitive bare specifier from INSIDE the package's own .d.ts —
            // mimics type-fest re-exporting `tagged-tag`'s symbols.
            [
                "import type { SomeHelper } from \"fake-transitive-helper\";",
                "export interface WorkOptions { verbose?: boolean; helper?: SomeHelper }",
                "export declare function work(value: string): string;",
                "",
            ].join("\n"),
        );

        // Note: fake-transitive-helper is NOT installed — if packem ran node-resolve
        // on it, the build would crash. It must be silently externalized.

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { type WorkOptions, work } from "fake-bundled-with-transitive";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-bundled-with-transitive": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // Transitive bare specifier stays external in the emitted .d.ts.
        expect(dMtsContent).toMatch(/from ["']fake-transitive-helper["']/);
        // The package itself is inlined (WorkOptions present).
        expect(dMtsContent).toMatch(/\bWorkOptions\b/);
    });

    it("should emit a single export for TS declaration-merging patterns (function+namespace, interface+const)", async () => {
        expect.assertions(6);

        // Repro for the rollup "Duplicate export X" crash when a bundled devDep contains
        // TypeScript declaration merging — two top-level declarations with the same name
        // (e.g. yaml's `function visit` + `namespace visit`, zod's `interface ZodError`
        // + `const ZodError`). The plugin must fold the companion into the primary so
        // fake-JS emits exactly one `export { X }` while still rendering both declaration
        // bodies in the final .d.ts.
        const mergedDepRoot = `${temporaryDirectoryPath}/node_modules/fake-merged-devdep`;

        await writeFile(
            `${mergedDepRoot}/package.json`,
            JSON.stringify({
                exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
                main: "./index.js",
                name: "fake-merged-devdep",
                types: "./index.d.ts",
                version: "1.0.0",
            }),
        );
        await writeFile(
            `${mergedDepRoot}/index.js`,
            "export function visit(node, visitor) { visitor(node); }\nvisit.BREAK = Symbol('BREAK');\nexport const ZodError = class { constructor(issues) { this.issues = issues; } };\n",
        );
        await writeFile(
            `${mergedDepRoot}/index.d.ts`,
            [
                "export declare function visit(node: unknown, visitor: (n: unknown) => void): void;",
                "export declare namespace visit {",
                "    const BREAK: unique symbol;",
                "}",
                "export interface ZodError<T = unknown> {",
                "    issues: T[];",
                "}",
                "export declare const ZodError: new <T>(issues: T[]) => ZodError<T>;",
                "",
            ].join("\n"),
        );

        await writeFile(
            `${temporaryDirectoryPath}/src/index.ts`,
            'export { visit, ZodError } from "fake-merged-devdep";\n',
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                "fake-merged-devdep": "*",
                typescript: "*",
            },
            exports: {
                ".": {
                    import: { default: "./dist/index.mjs", types: "./dist/index.d.mts" },
                    require: { default: "./dist/index.cjs", types: "./dist/index.d.cts" },
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
            typesVersions: { "*": { ".": ["./dist/index.d.ts"] } },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        // The build must not crash on the duplicate export — that's the actual regression.
        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stderr).not.toContain("Duplicate export");

        const dMtsContent = await readFile(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // Both declaration partners must survive in the emitted .d.ts (merge semantics preserved).
        expect(dMtsContent).toMatch(/declare function visit/);
        expect(dMtsContent).toMatch(/namespace visit/);
        expect(dMtsContent).toMatch(/interface ZodError/);
        expect(dMtsContent).toMatch(/declare const ZodError/);
    });
});
