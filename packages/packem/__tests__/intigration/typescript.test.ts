import { existsSync, symlinkSync } from "node:fs";
import { rm } from "node:fs/promises";

import { isAccessibleSync, readFileSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import getRegexMatches from "../../src/utils/get-regex-matches";
import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem typescript", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.each([
        ["cts", "cjs"],
        ["mts", "mjs"],
        ["ts", "cjs"],
    ])("should throw a error if export match a ts file and typescript is missing", async (tsExtension, jsExtension) => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.${tsExtension}`, `export default () => 'index';`);

        await createPackageJson(temporaryDirectoryPath, {
            exports: `./dist/index.${jsExtension}`,
            type: jsExtension === "mjs" ? "module" : "commonjs",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should show a info if declaration is disabled", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, { config: { declaration: false } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Generation of declaration files are disabled.");
    });

    it("should not throw a error if declaration is disabled and a types fields are present", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

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
        await createPackemConfig(temporaryDirectoryPath, { config: { declaration: false } });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Generation of declaration files are disabled.");
    });

    describe("resolve-typescript-mjs-cjs plugin", () => {
        it("should resolve .jsx -> .tsx", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.jsx";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.tsx`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .jsx -> .js", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.js`, 'import "./file.jsx";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.jsx`, "console.log(1);");

            await createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.mjs",
                type: "module",
            });
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .mjs -> .ts", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.mjs";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.mjs`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .cjs -> .ts", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.cjs";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.cjs`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            await createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.mjs",
                type: "module",
            });
            await createTsConfig(temporaryDirectoryPath);
            await createPackemConfig(temporaryDirectoryPath);

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });
    });

    describe("resolve-typescript-tsconfig-paths plugin", () => {
        it("should resolve tsconfig paths", async () => {
            expect.assertions(5);

            await installPackage(temporaryDirectoryPath, "typescript");

            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                'import "components:Test";\n import { test2 } from "components:Test2";\n\nconsole.log(test2);',
            );
            writeFileSync(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");
            writeFileSync(`${temporaryDirectoryPath}/src/components/Test2.ts`, "export const test2 = 'test'");

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

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).not.toContain("If this is incorrect, add it to the");

            const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);
            expect(cjs).toMatchSnapshot("cjs code output");

            const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
            expect(mjs).toMatchSnapshot("mjs code output");
        });

        it.each([
            ["@/", "@/*", false],
            ["#/", "#/*", false],
            ["~/", "~/*", false],
            ["/", "/*", true],
        ])("should resolve tsconfig paths with a '%s'", async (namespace, patchKey, resolveAbsolutePath) => {
            expect.assertions(5);

            writeFileSync(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");
            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `import "${namespace as string}Test";`);

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

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).not.toContain("If this is incorrect, add it to the");

            const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjs).toBe(`'use strict';

console.log(1);
`);

            const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjs).toBe(`console.log(1);
`);
        });
    });

    describe("resolve-typescript-tsconfig-root-dirs plugin", () => {
        it("should resolve tsconfig rootDirs", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import { b } from "./bb";\n\nconsole.log(b);');
            writeFileSync(`${temporaryDirectoryPath}/tt/a/aa.ts`, "export const a = 1;");
            writeFileSync(`${temporaryDirectoryPath}/tt/b/bb.ts`, 'import { a } from "./aa";\nnconsole.log(a);\n\nexport const b = 2;');

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

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjs).toBe(`'use strict';

const a = 1;

nconsole.log(a);
const b = 2;

console.log(b);
`);

            const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjs).toBe(`const a = 1;

nconsole.log(a);
const b = 2;

console.log(b);
`);
        });
    });

    it("should support typescript decorator", async () => {
        expect.assertions(4);

        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
        expect(mjs).toMatchSnapshot("mjs code output");

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);
        expect(cjs).toMatchSnapshot("cjs code output");
    });

    it('should allow support for "allowJs" and generate proper assets', async () => {
        expect.assertions(5);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export default () => 'index';`);

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
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs code output");

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toMatchSnapshot("cts type code output");

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toMatchSnapshot("ts type code output");
    });

    it("should output correct bundles and types import json with export condition", async () => {
        expect.assertions(4);

        writeFileSync(
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
                    default: "./dist/index.mjs",
                    types: "./dist/index.d.mts",
                },
            },
            type: "module",
            version: "0.0.1",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const version: string;

export { version };
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(dCtsContent).toBe(`const devDependencies = {
	esbuild: "*",
	typescript: "*"
};
const exports = {
	".": {
		"default": "./dist/index.mjs",
		types: "./dist/index.d.mts"
	}
};
const type = "module";
const version$1 = "0.0.1";
const pkgJson = {
	devDependencies: devDependencies,
	exports: exports,
	type: type,
	version: version$1
};

const version = pkgJson.version;

export { version };
`);
    });

    it("should work with tsconfig 'incremental' option", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(dCtsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

export { index as default };
`);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(join(temporaryDirectoryPath, ".tsbuildinfo"))).toBeFalsy();
    });

    it("should work with tsconfig 'incremental' and 'tsBuildInfoFile' option", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { incremental: true, tsBuildInfoFile: ".tsbuildinfo" },
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(dCtsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

export { index as default };
`);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(join(temporaryDirectoryPath, ".tsbuildinfo"))).toBeFalsy();
    });

    it("should work with tsconfig 'noEmit' option", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);

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
        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                noEmit: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

export { index as default };
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);
    });

    it("should work with symlink dependencies", async () => {
        expect.assertions(4);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { fn } from 'dep-a';

export default fn({ value: 1 });`,
        );

        const depAIndexDtsPath = `${temporaryDirectoryPath}/store/dep-a/index.d.ts`;

        writeFileSync(depAIndexDtsPath, `export * from 'dep-b';`);
        writeFileSync(
            `${temporaryDirectoryPath}/store/dep-a/node_modules/dep-b/index.d.ts`,
            `type data = {
    value: number;
};

export declare function fn(a: data): data;
    `,
        );

        writeJsonSync(join(temporaryDirectoryPath, "node_modules", "dep-a", "package.json"), { main: "index.js", name: "dep-a" });
        writeFileSync(join(temporaryDirectoryPath, "node_modules", "dep-a", "index.js"), "console.log('dep-a');");

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        symlinkSync(depAIndexDtsPath, join(temporaryDirectoryPath, "node_modules", "dep-a", "index.d.ts"));

        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.mjs",
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`import * as dep_a from 'dep-a';

declare const _default: dep_a.data;

export { _default as default };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`import * as dep_a from 'dep-a';

declare const _default: dep_a.data;

export { _default as default };
`);
    });

    it("should automatically convert imports with .ts extension", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/utils/one.ts`, `export const one = 1`);
        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function getOne() {
  return await import('./packem_chunks/one.mjs').then((m) => m.one);
}
__name(getOne, "getOne");

export { getOne };
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare function getOne(): Promise<number>;

export { getOne };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function getOne() {
  return await import('./packem_chunks/one.cjs').then((m) => m.one);
}
__name(getOne, "getOne");

exports.getOne = getOne;
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function getOne(): Promise<number>;

export { getOne };
`);
    });

    it("should automatically convert dynamic imports with .ts extension to cjs or mjs", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/utils/one.ts`, `export const one = 1`);
        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function getOne() {
  const path = "one";
  return await import(\`./utils/\${path}.mjs\`).then((m) => m.one);
}
__name(getOne, "getOne");

export { getOne };
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare function getOne(): Promise<any>;

export { getOne };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function getOne() {
  const path = "one";
  return await import(\`./utils/\${path}.cjs\`).then((m) => m.one);
}
__name(getOne, "getOne");

exports.getOne = getOne;
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function getOne(): Promise<any>;

export { getOne };
`);
    });

    it("should contain correct type file path of shared chunks", async () => {
        expect.assertions(13);

        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "react");

        writeFileSync(`${temporaryDirectoryPath}/src/another.ts`, `export { sharedApi as anotherSharedApi } from './lib/util.shared-runtime'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-server.ts`, `export { AppContext } from './lib/app-context.shared-runtime'`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export const index = 'index'
export { sharedApi } from './lib/util.shared-runtime'
export { AppContext } from './lib/app-context.shared-runtime'
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/lib/app-context.shared-runtime.ts`,
            `'use client'

import React from 'react'

export const AppContext = React.createContext(null)`,
        );
        writeFileSync(
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
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
        const mjsMatches: string[] = getRegexMatches(/from\s'.*';/g, mjsContent);

        expect(mjsMatches).toHaveLength(2);
        expect(mjsContent).toBe(`export { sharedApi } ${mjsMatches[0] as string}
export { AppContext } ${mjsMatches[1] as string}

const index = "index";

export { index };
`);

        const mjsChunk1Content = readFileSync(`${temporaryDirectoryPath}/dist/${(mjsMatches[0] as string).replace("from './", "").replace("';", "")}`);

        expect(mjsChunk1Content).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function sharedApi() {
  return "common:shared";
}
__name(sharedApi, "sharedApi");

export { sharedApi };
`);

        const mjsChunk2Content = readFileSync(`${temporaryDirectoryPath}/dist/${(mjsMatches[1] as string).replace("from './", "").replace("';", "")}`);

        expect(mjsChunk2Content).toBe(`'use client';
import React from 'react';

const AppContext = React.createContext(null);

export { AppContext };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);
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

        const cjsChunk1Content = readFileSync(`${temporaryDirectoryPath}/dist/${(cjsMatches[0] as string).replace("require('./", "").replace("');", "")}`);

        expect(cjsChunk1Content).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function sharedApi() {
  return "common:shared";
}
__name(sharedApi, "sharedApi");

exports.sharedApi = sharedApi;
`);

        const cjsChunk2Content = readFileSync(`${temporaryDirectoryPath}/dist/${(cjsMatches[1] as string).replace("require('./", "").replace("');", "")}`);

        expect(cjsChunk2Content).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const React = require('react');

const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const React__default = /*#__PURE__*/_interopDefaultCompat(React);

const AppContext = React__default.createContext(null);

exports.AppContext = AppContext;
`);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`export { anotherSharedApi as sharedApi } from './another.mjs';

declare const AppContext: any;

declare const index = "index";

export { AppContext, index };
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`export { anotherSharedApi as sharedApi } from './another.cjs';

declare const AppContext: any;

declare const index = "index";

export { AppContext, index };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`export { anotherSharedApi as sharedApi } from './another.js';

declare const AppContext: any;

declare const index = "index";

export { AppContext, index };
`);
    });

    // eslint-disable-next-line sonarjs/cognitive-complexity
    describe("isolated declarations", () => {
        it.each(["typescript", "oxc", "swc"])(
            "should work with '%s' isolated declarations transformer and commonjs package",
            async (isolatedDeclarationTransformer) => {
                expect.assertions(7);

                const quote = ["swc", "typescript"].includes(isolatedDeclarationTransformer) ? "'" : '"';

                writeFileSync(
                    `${temporaryDirectoryPath}/src/index.ts`,
                    `import { type Num } from './types'
export type Str = string

export function hello(s: Str): Str {
  return 'hello' + s
}

export let num: Num = 1`,
                );
                writeFileSync(
                    `${temporaryDirectoryPath}/src/types.ts`,
                    `import type { Num2 } from './types2'
export type Num = number`,
                );
                writeFileSync(
                    `${temporaryDirectoryPath}/src/types2.ts`,
                    `import type { Num } from './types'
export type Num2 = number`,
                );

                await installPackage(temporaryDirectoryPath, "typescript");

                if (isolatedDeclarationTransformer === "oxc") {
                    await installPackage(temporaryDirectoryPath, "oxc-transform");
                }

                if (isolatedDeclarationTransformer === "swc") {
                    await installPackage(temporaryDirectoryPath, "@swc/core");
                }

                await createPackageJson(temporaryDirectoryPath, {
                    devDependencies: {
                        typescript: "*",
                    },
                    exports: {
                        ".": {
                            default: "./dist/index.cjs",
                            types: "./dist/index.d.cts",
                        },
                    },
                });
                await createPackemConfig(temporaryDirectoryPath, {
                    isolatedDeclarationTransformer: isolatedDeclarationTransformer as "swc" | "typescript" | "oxc" | undefined,
                    transformer: "esbuild",
                });
                await createTsConfig(temporaryDirectoryPath, {
                    compilerOptions: {
                        isolatedDeclarations: true,
                        noErrorTruncation: true,
                    },
                });

                const binProcess = await execPackemSync("build", [], {
                    cwd: temporaryDirectoryPath,
                    reject: false,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(binProcess.stdout).toContain("Using isolated declaration transformer to generate declaration files...");

                const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

                expect(dCtsContent).toBe(`import { type Num } from ${quote}./types.d.cts${quote};
export type Str = string;
export declare function hello(s: Str): Str;
export declare let num: Num;
`);

                const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

                expect(dtsContent).toBe(`import { type Num } from ${quote}./types.d.ts${quote};
export type Str = string;
export declare function hello(s: Str): Str;
export declare let num: Num;
`);

                const dCtsTypesContent = readFileSync(`${temporaryDirectoryPath}/dist/types.d.cts`);

                expect(dCtsTypesContent).toBe(
                    isolatedDeclarationTransformer === "swc"
                        ? `import type { Num2 } from './types2.d.cts';
export type Num = number;
`
                        : `export type Num = number;
`,
                );

                const dtsTypesContent = readFileSync(`${temporaryDirectoryPath}/dist/types.d.ts`);

                expect(dtsTypesContent).toBe(
                    isolatedDeclarationTransformer === "swc"
                        ? `import type { Num2 } from './types2.d.ts';
export type Num = number;
`
                        : `export type Num = number;
`,
                );
            },
        );

        it.each(["typescript", "oxc", "swc"])(
            "should work with '%s' isolated declarations transformer and module package",
            async (isolatedDeclarationTransformer) => {
                expect.assertions(5);

                const quote = ["swc", "typescript"].includes(isolatedDeclarationTransformer) ? "'" : '"';

                writeFileSync(
                    `${temporaryDirectoryPath}/src/index.ts`,
                    `import { type Num } from './types'
export type Str = string

export function hello(s: Str): Str {
  return 'hello' + s
}

export let num: Num = 1`,
                );
                writeFileSync(
                    `${temporaryDirectoryPath}/src/types.ts`,
                    `import type { Num2 } from './types2'
export type Num = number`,
                );
                writeFileSync(
                    `${temporaryDirectoryPath}/src/types2.ts`,
                    `import type { Num } from './types'
export type Num2 = number`,
                );

                await installPackage(temporaryDirectoryPath, "typescript");

                if (isolatedDeclarationTransformer === "oxc") {
                    await installPackage(temporaryDirectoryPath, "oxc-transform");
                }

                if (isolatedDeclarationTransformer === "swc") {
                    await installPackage(temporaryDirectoryPath, "@swc/core");
                }

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
                await createPackemConfig(temporaryDirectoryPath, {
                    isolatedDeclarationTransformer: isolatedDeclarationTransformer as "swc" | "typescript" | "oxc" | undefined,
                    transformer: "esbuild",
                });
                await createTsConfig(temporaryDirectoryPath, {
                    compilerOptions: {
                        isolatedDeclarations: true,
                        noErrorTruncation: true,
                    },
                });

                const binProcess = await execPackemSync("build", [], {
                    cwd: temporaryDirectoryPath,
                    reject: false,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(binProcess.stdout).toContain("Using isolated declaration transformer to generate declaration files...");

                const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

                expect(dMtsContent).toBe(`import { type Num } from ${quote}./types.d.mts${quote};
export type Str = string;
export declare function hello(s: Str): Str;
export declare let num: Num;
`);

                const dMtsTypesContent = readFileSync(`${temporaryDirectoryPath}/dist/types.d.mts`);

                expect(dMtsTypesContent).toBe(
                    isolatedDeclarationTransformer === "swc"
                        ? `import type { Num2 } from './types2.d.mts';
export type Num = number;
`
                        : `export type Num = number;
`,
                );
            },
        );

        it.each(["typescript", "oxc", "swc"])(
            "should patch cjs default export with '%s' isolated declarations transformer",
            async (isolatedDeclarationTransformer) => {
                expect.assertions(6);

                writeFileSync(
                    `${temporaryDirectoryPath}/src/index.ts`,
                    `const test = () => {
    return "this should be in final bundle, test function";
};

export default test;
`,
                );

                await installPackage(temporaryDirectoryPath, "typescript");

                if (isolatedDeclarationTransformer === "oxc") {
                    await installPackage(temporaryDirectoryPath, "oxc-transform");
                }

                if (isolatedDeclarationTransformer === "swc") {
                    await installPackage(temporaryDirectoryPath, "@swc/core");
                }

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
                });
                await createPackemConfig(temporaryDirectoryPath, {
                    config: {
                        cjsInterop: true,
                    },
                    isolatedDeclarationTransformer: isolatedDeclarationTransformer as "swc" | "typescript" | "oxc" | undefined,
                    transformer: "esbuild",
                });
                await createTsConfig(temporaryDirectoryPath, {
                    compilerOptions: {
                        isolatedDeclarations: true,
                        noErrorTruncation: true,
                    },
                });

                const binProcess = await execPackemSync("build", [], {
                    cwd: temporaryDirectoryPath,
                    reject: false,
                });

                expect(binProcess.stderr).toBe("");
                expect(binProcess.exitCode).toBe(0);
                expect(binProcess.stdout).toContain("Using isolated declaration transformer to generate declaration files...");

                const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

                expect(dCtsContent).toBe(`declare const test: () => ${isolatedDeclarationTransformer === "swc" ? "any" : "string"};


export = test;`);

                const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

                expect(dtsContent).toBe(`declare const test: () => ${isolatedDeclarationTransformer === "swc" ? "any" : "string"};


export = test;`);

                const dCtsTypesContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

                expect(dCtsTypesContent).toBe(`declare const test: () => ${isolatedDeclarationTransformer === "swc" ? "any" : "string"};
export default test;
`);
            },
        );

        it.each(["typescript", "oxc", "swc"])("should resolve aliases with '%s' isolated declarations transformer", async (isolatedDeclarationTransformer) => {
            expect.assertions(9);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import { a } from "utils/a";\nexport default a;');
            writeFileSync(`${temporaryDirectoryPath}/src/utils/a.ts`, "export const a: number = 1;");

            await installPackage(temporaryDirectoryPath, "typescript");

            if (isolatedDeclarationTransformer === "oxc") {
                await installPackage(temporaryDirectoryPath, "oxc-transform");
            }

            if (isolatedDeclarationTransformer === "swc") {
                await installPackage(temporaryDirectoryPath, "@swc/core");
            }

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
            });
            await createPackemConfig(temporaryDirectoryPath, {
                config: {
                    cjsInterop: true,
                },
                isolatedDeclarationTransformer: isolatedDeclarationTransformer as "swc" | "typescript" | "oxc" | undefined,
                transformer: "esbuild",
            });
            await createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    baseUrl: "src",
                    isolatedDeclarations: true,
                    noErrorTruncation: true,
                    paths: {
                        "utils/*": ["utils/*.ts"],
                    },
                },
            });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
                reject: false,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);
            expect(binProcess.stdout).toContain("Using isolated declaration transformer to generate declaration files...");

            const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

            expect(dCtsContent).toBe(`import { a } from "./utils/a.d.cts";


export = a;`);
            expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/utils/a.d.cts`)).toBeTruthy();

            const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

            expect(dtsContent).toBe(`import { a } from "./utils/a.d.ts";


export = a;`);
            expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/utils/a.d.ts`)).toBeTruthy();

            const dCtsTypesContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

            expect(dCtsTypesContent).toBe(`import { a } from "./utils/a.d.mts";
export default a;
`);
            expect(isAccessibleSync(`${temporaryDirectoryPath}/dist/utils/a.d.mts`)).toBeTruthy();
        });
    });

    it("should use the outDir option from tsconfig if present", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

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
                    default: "./lib/index.cjs",
                    types: "./lib/index.d.ts",
                },
            },
            types: "./lib/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/lib/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

module.exports = index;
`);
    });

    it("should fix dts files for commonjs when cjsInterop is enabled and the file has named exports with default", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const test = /* @__PURE__ */ __name(() => {
  return "this should be in final bundle, test function";
}, "test");
const test2 = "this should be in final bundle, test2 string";

module.exports = test;
module.exports.test2 = test2;
`);
        const cDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";

export {  test2 };

export = test;
`);

        const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";

export {  test2 };

export = test;
`);

        const mDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";

export { test as default, test2 };
`);
    });

    it("should fix dts files for commonjs when cjsInterop is enabled and the file has named exports with default 2", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: 'Module' } });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const test = /* @__PURE__ */ __name(() => {
  return "this should be in final bundle, test function";
}, "test");
const test2 = "this should be in final bundle, test2 string";

module.exports = test;
module.exports.test2 = test2;
`);
        const cDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";

export {  test2 };

export = test;
`);

        const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";

export {  test2 };

export = test;
`);

        const mDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`declare const test: () => string;
declare const test2 = "this should be in final bundle, test2 string";

export { test as default, test2 };
`);
    });

    it("should fix dts files for commonjs when cjsInterop is enabled and the file has a default export", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const test = /* @__PURE__ */ __name(() => {
  return "this should be in final bundle, test function";
}, "test");

module.exports = test;
`);
        const cDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`declare const test: () => string;

export = test;
`);

        const dtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dtsContent).toBe(`declare const test: () => string;

export = test;
`);

        const mDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`declare const test: () => string;

export { test as default };
`);
    });

    describe("node10 compatibility", () => {
        it("should generate a node10 typesVersions field console info", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const test = "this should be in final bundle, test2 string";`);
            writeFileSync(`${temporaryDirectoryPath}/src/deep/index.ts`, `export const test = "this should be in final bundle, test2 string";`);

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

            const binProcess = await execPackemSync("build", [], {
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

        it("should generate a node10 typesVersions field in package.json when rollup.node10Compatibility.writeToPackageJson is true", async () => {
            expect.assertions(5);

            await installPackage(temporaryDirectoryPath, "typescript");

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const test = "this should be in final bundle, test2 string";`);
            writeFileSync(`${temporaryDirectoryPath}/src/deep/index.ts`, `export const test = "this should be in final bundle, test2 string";`);

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
                    rollup: {
                        node10Compatibility: {
                            writeToPackageJson: true,
                        },
                    },
                },
            });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            expect(binProcess.stdout).toContain("Declaration node10 compatibility mode is enabled.");
            expect(binProcess.stdout).toContain(`Your package.json "typesVersions" field has been updated.`);

            const packageJson = JSON.parse(readFileSync(`${temporaryDirectoryPath}/package.json`).toString());
            expect(packageJson.typesVersions).toMatchSnapshot("typesVersions");
        });

        it("should generate a node10 typesVersions field on console with ignored shared files", async () => {
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            writeFileSync(`${temporaryDirectoryPath}/src/shared/index.ts`, `export const shared = "this should be in final bundle, test2 string";`);
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `export { shared } from "./shared";
export const test = "this should be in final bundle, test2 string";`,
            );
            writeFileSync(
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

            const binProcess = await execPackemSync("build", [], {
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

            writeFileSync(`${temporaryDirectoryPath}/src/shared/index.ts`, `export const shared = "this should be in final bundle, test2 string";`);
            writeFileSync(
                `${temporaryDirectoryPath}/src/index.ts`,
                `export { shared } from "./shared";
export const test = "this should be in final bundle, test2 string";`,
            );
            writeFileSync(
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

            const binProcess = await execPackemSync("build", [], {
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

            writeFileSync(`${temporaryDirectoryPath}/src/index.browser.ts`, `export const browser = "browser";`);
            writeFileSync(`${temporaryDirectoryPath}/src/index.server.ts`, `export const server = "server";`);
            writeFileSync(`${temporaryDirectoryPath}/src/pail.browser.ts`, `export const browser = "server";`);
            writeFileSync(`${temporaryDirectoryPath}/src/pail.server.ts`, `export const server = "server";`);
            writeFileSync(`${temporaryDirectoryPath}/src/processor.browser.ts`, `export const browser = "server";`);
            writeFileSync(`${temporaryDirectoryPath}/src/processor.server.ts`, `export const server = "server";`);
            writeFileSync(`${temporaryDirectoryPath}/src/reporter.browser.ts`, `export const browser = "server";`);
            writeFileSync(`${temporaryDirectoryPath}/src/reporter.server.ts`, `export const server = "server";`);

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

            const binProcess = await execPackemSync("build", [], {
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
    });

    it("should use the exports key from package.json if declaration are off", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/config/index.ts`, `export default () => 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/config.ts`, `export default () => 'config';`);

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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/config.cjs`);

        expect(cjs).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const config = /* @__PURE__ */ __name(() => "config", "default");

module.exports = config;
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/config.mjs`);

        expect(mjs).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const config = /* @__PURE__ */ __name(() => "config", "default");

export { config as default };
`);
    });

    // This test is connected to the caching of the @rollup/plugin-node-resolve
    it("should bundle deeks package", async () => {
        expect.assertions(6);

        writeFileSync(
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        console.log(binProcess.stdout);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`interface DeeksOptions {
    /** @default false */
    arrayIndexesAsKeys?: boolean;
    /** @default true */
    expandNestedObjects?: boolean;
    /** @default false */
    expandArrayObjects?: boolean;
    /** @default false */
    ignoreEmptyArraysWhenExpanding?: boolean;
    /** @default false */
    escapeNestedDots?: boolean;
    /** @default false */
    ignoreEmptyArrays?: boolean;
}

/**
 * Return the deep keys list for a single document
 * @param object
 * @param options
 * @returns {Array}
 */
declare function deepKeys(object: object, options?: DeeksOptions): string[];
/**
 * Return the deep keys list for all documents in the provided list
 * @param list
 * @param options
 * @returns Array[Array[String]]
 */
declare function deepKeysFromList(list: object[], options?: DeeksOptions): string[][];

export { type DeeksOptions as DeepKeysOptions, deepKeys, deepKeysFromList };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`interface DeeksOptions {
    /** @default false */
    arrayIndexesAsKeys?: boolean;
    /** @default true */
    expandNestedObjects?: boolean;
    /** @default false */
    expandArrayObjects?: boolean;
    /** @default false */
    ignoreEmptyArraysWhenExpanding?: boolean;
    /** @default false */
    escapeNestedDots?: boolean;
    /** @default false */
    ignoreEmptyArrays?: boolean;
}

/**
 * Return the deep keys list for a single document
 * @param object
 * @param options
 * @returns {Array}
 */
declare function deepKeys(object: object, options?: DeeksOptions): string[];
/**
 * Return the deep keys list for all documents in the provided list
 * @param list
 * @param options
 * @returns Array[Array[String]]
 */
declare function deepKeysFromList(list: object[], options?: DeeksOptions): string[][];

export { type DeeksOptions as DeepKeysOptions, deepKeys, deepKeysFromList };
`);

        const ctsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(ctsContent).toMatchSnapshot("cjs content");

        const mtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(mtsContent).toMatchSnapshot("mjs content");
    });
});
