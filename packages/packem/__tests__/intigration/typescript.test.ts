import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem typescript", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        createPackemConfig(temporaryDirectoryPath, {});
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    describe("resolve-typescript-mjs-cjs plugin", () => {
        it("should resolve .jsx -> .tsx", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.jsx";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.tsx`, "console.log(1);");
            createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.cjs",
                type: "module",
            });
            writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {});

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .jsx -> .js", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.js`, 'import "./file.jsx";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.jsx`, "console.log(1);");
            createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.cjs",
                type: "module",
            });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .mjs -> .ts", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.mjs";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.mjs`, "console.log(1);");
            createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.cjs",
                type: "module",
            });
            writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {});

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });

        it("should resolve .cjs -> .ts", async () => {
            expect.assertions(3);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "./file.cjs";');
            writeFileSync(`${temporaryDirectoryPath}/src/file.cjs`, "console.log(1);");
            createPackageJson(temporaryDirectoryPath, {
                main: "./dist/index.cjs",
                type: "module",
            });
            writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {});

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const content = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(content).toBe("console.log(1);\n");
        });
    });

    describe("resolve-typescript-tsconfig-paths plugin", () => {
        it("should resolve tsconfig paths", async () => {
            expect.assertions(4);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "components:Test";');
            writeFileSync(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");
            writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
                compilerOptions: {
                    baseUrl: "src",
                    paths: {
                        "components:*": ["components/*.ts"],
                    },
                },
            });
            createPackageJson(temporaryDirectoryPath, { main: "./dist/index.cjs" });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
            expect(binProcess.exitCode).toBe(0);

            const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

            expect(cjs).toBe(`'use strict';

console.log(1);
`);

            const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

            expect(mjs).toBe(`console.log(1);
`);
        });

        it("should resolve tsconfig paths with a '@'", async () => {
            expect.assertions(4);

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import "@/Test";');
            writeFileSync(`${temporaryDirectoryPath}/src/components/Test.ts`, "console.log(1);");
            writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
                compilerOptions: {
                    baseUrl: "src",
                    paths: {
                        "@/*": ["components/*.ts"],
                    },
                },
            });
            createPackageJson(temporaryDirectoryPath, { main: "./dist/index.cjs" });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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

            writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, 'import { b } from "./bb";\n\nconsole.log(b);');
            writeFileSync(`${temporaryDirectoryPath}/tt/a/aa.ts`, "export const a = 1;");
            writeFileSync(`${temporaryDirectoryPath}/tt/b/bb.ts`, 'import { a } from "./aa";\nnconsole.log(a);\n\nexport const b = 2;');
            writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
                compilerOptions: {
                    rootDir: ".",
                    rootDirs: ["src", "tt/b", "tt/a"],
                },
            });
            createPackageJson(temporaryDirectoryPath, { main: "./dist/index.cjs" });

            const binProcess = await execPackemSync("build", [], {
                cwd: temporaryDirectoryPath,
            });

            await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "module",
        });
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                experimentalDecorators: true,
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result)
    __defProp(target, key, result);
  return result;
};
function first() {
  console.log("first(): factory evaluated");
  return function(target, propertyKey, descriptor) {
    console.log("first(): called");
  };
}
__name(first, "first");
class ExampleClass {
  static {
    __name(this, "ExampleClass");
  }
  value;
}
__decorateClass([
  first()
], ExampleClass.prototype, "value", 2);

export { ExampleClass };
`);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result)
    __defProp(target, key, result);
  return result;
};
function first() {
  console.log("first(): factory evaluated");
  return function(target, propertyKey, descriptor) {
    console.log("first(): called");
  };
}
__name(first, "first");
class ExampleClass {
  static {
    __name(this, "ExampleClass");
  }
  value;
}
__decorateClass([
  first()
], ExampleClass.prototype, "value", 2);

exports.ExampleClass = ExampleClass;
`);
    });

    it('should allow support for "allowJs" and generate proper assets', async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export default () => 'index';`);
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                allowJs: true,
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.js",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

console.log(1);
`);

        const dCtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(dCtsContent).toBe(`declare function _default(): string;
`);

        const dTsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.s`);

        expect(dTsContent).toBe(`declare function _default(): string;
`);
    });

    it("should output correct bundles and types import json with export condition", async () => {
        expect.assertions(5);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import pkgJson from '../package.json'

export const version = pkgJson.version;
`,
        );
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                moduleResolution: "bundler",
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    default: "./dist/index.mjs",
                    types: "./dist/index.d.mts",
                },
            },
            type: "module",
            version: "0.0.1",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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

        expect(dCtsContent).toBe(`const exports = {
	".": {
		"default": "./dist/index.mjs",
		types: "./dist/index.d.mts"
	}
};
const type = "module";
const version$1 = "0.0.1";
const pkgJson = {
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

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                incremental: true,
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                incremental: true,
                tsBuildInfoFile: ".tsbuildinfo",
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index'`);
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                noEmit: true,
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
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
    });
});
