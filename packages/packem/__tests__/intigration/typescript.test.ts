import { existsSync, symlinkSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

        createPackageJson(temporaryDirectoryPath, {
            exports: `./dist/index.${jsExtension}`,
            type: jsExtension === "mjs" ? "module" : "commonjs",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain("You tried to use a `.ts`, `.cts` or `.mts` file but `typescript` was not found in your package.json");
        expect(binProcess.exitCode).toBe(1);
    });

    it("should show a warning if declaration is disabled", async () => {
        expect.assertions(3);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        createTsConfig(temporaryDirectoryPath, {});

        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, { declaration: false });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);
        expect(binProcess.stdout).toContain("Generation of declaration files is disabled.");
    });

    describe("resolve-typescript-mjs-cjs plugin", () => {
        it("should resolve .jsx -> .tsx", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.jsx";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.tsx`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.mjs",
                type: "module",
            });
            createTsConfig(temporaryDirectoryPath, {});
            await createPackemConfig(temporaryDirectoryPath, {});

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

            createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.mjs",
                type: "module",
            });
            await createPackemConfig(temporaryDirectoryPath, {});

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
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.mjs",
                type: "module",
            });
            createTsConfig(temporaryDirectoryPath, {});
            await createPackemConfig(temporaryDirectoryPath, {});

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
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.mjs",
                type: "module",
            });
            createTsConfig(temporaryDirectoryPath, {});
            await createPackemConfig(temporaryDirectoryPath, {});

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
            expect.assertions(4);

            await installPackage(temporaryDirectoryPath, "typescript");

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "components:Test";');
            writeFileSync(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");

            createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    baseUrl: "src",
                    paths: {
                        "components:*": ["components/*.ts"],
                    },
                },
            });
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            });
            await createPackemConfig(temporaryDirectoryPath, {});

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

            const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);
            expect(cjs).toMatchSnapshot("cjs code output");

            const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
            expect(mjs).toMatchSnapshot("mjs code output");
        });

        it("should resolve tsconfig paths with a '@'", async () => {
            expect.assertions(4);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "@/Test";');
            writeFileSync(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");

            await installPackage(temporaryDirectoryPath, "typescript");
            createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    baseUrl: "src",
                    paths: {
                        "@": ["components/*.ts"],
                    },
                },
            });
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
            });
            await createPackemConfig(temporaryDirectoryPath, {});

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            expect(binProcess.stderr).toBe("");
            expect(binProcess.exitCode).toBe(0);

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

            await installPackage(temporaryDirectoryPath, "typescript");
            createTsConfig(temporaryDirectoryPath, {
                compilerOptions: {
                    rootDir: ".",
                    rootDirs: ["src", "tt/b", "tt/a"],
                },
            });
            createPackageJson(temporaryDirectoryPath, {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
            });
            await createPackemConfig(temporaryDirectoryPath, {});

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
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
        });
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                experimentalDecorators: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowJs: true,
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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
        expect.assertions(5);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import pkgJson from '../package.json'

export const version = pkgJson.version;
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });
        createPackageJson(temporaryDirectoryPath, {
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
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const version: string;

export { version };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const version: string;

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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { incremental: true },
        });
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { incremental: true, tsBuildInfoFile: ".tsbuildinfo" },
        });
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.mjs",
                    types: "./dist/index.d.ts",
                },
            },
            type: "module",
        });
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                noEmit: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);
    });

    it("should work with symlink dependencies", async () => {
        expect.assertions(5);

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

        createPackageJson(temporaryDirectoryPath, {
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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                noEmit: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        console.log(binProcess.stdout);

        const dMtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);
    });

    it("should automatically convert imports with .ts extension", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/utils/one.ts`, `export const one = 1`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export async function getOne() {
  return await import('./utils/one.ts').then(m => m.one)
}`,
        );
        createPackageJson(temporaryDirectoryPath, {
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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowImportingTsExtensions: true,
                module: "esnext",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function getOne() {
  return await import('./chunks/one.mjs').then((m) => m.one);
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
  return await import('./chunks/one.cjs').then((m) => m.one);
}
__name(getOne, "getOne");

exports.getOne = getOne;
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function getOne(): Promise<number>;

export { getOne };
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare function getOne(): Promise<number>;

export { getOne };
`);
    });

    it("should automatically convert dynamic imports with .ts extension to cjs or mjs", async () => {
        expect.assertions(7);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/utils/one.ts`, `export const one = 1`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export async function getOne() {
  const path = 'one'
  return await import(\`./utils/\${path}.ts\`).then(m => m.one)
}`,
        );
        createPackageJson(temporaryDirectoryPath, {
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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                allowImportingTsExtensions: true,
                module: "esnext",
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare function getOne(): Promise<any>;

export { getOne };
`);
    });

    it("should contain correct type file path of shared chunks", async () => {
        expect.assertions(5);

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

        createPackageJson(temporaryDirectoryPath, {
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
        createTsConfig(temporaryDirectoryPath, {
            compilerOptions: {
                noEmit: true,
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {});

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

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContent).toBe(`declare const _default: () => string;

export { _default as default };
`);
    });
});
