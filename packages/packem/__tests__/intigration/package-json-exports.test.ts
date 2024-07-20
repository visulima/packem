import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { readFileSync, writeFileSync, writeJsonSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem package.json exports", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath, {});
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should generate proper assets with js based on the package.json exports default", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `import myMod from 'my-mod'

export default 'exports-sugar-default'

export function method() {
  return myMod.test()
}
`,
        );
        createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "my-mod": "*",
            },
            exports: {
                default: "./dist/index.mjs",
                node: "./dist/index.cjs",
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import myMod from 'my-mod';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = "exports-sugar-default";
function method() {
  return myMod.test();
}
__name(method, "method");

export { index as default, method };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const myMod = require('my-mod');

function _interopDefaultCompat (e) { return e && typeof e === 'object' && 'default' in e ? e.default : e; }

const myMod__default = /*#__PURE__*/_interopDefaultCompat(myMod);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = "exports-sugar-default";
function method() {
  return myMod__default.test();
}
__name(method, "method");

exports.default = index;
exports.method = method;
`);
    });

    it("should generate proper assets with js based on the package.json exports", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export default 'exports-sugar'`);
        createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "my-mod": "*",
            },
            exports: {
                import: "./dist/index.mjs",
                module: "./dist/index.mjs",
                require: "./dist/index.cjs",
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const file of ["index.cjs", "index.esm.js", "index.mjs"]) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            expect(existsSync(`${temporaryDirectoryPath}/dist/${file}`)).toBeTruthy();
        }
    });

    it("should work with dev and prod optimize conditions", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = process.env.NODE_ENV;`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    default: "./dist/index.js",
                    import: {
                        default: "./dist/index.mjs",
                        development: "./dist/index.development.mjs",
                        production: "./dist/index.production.mjs",
                    },
                    require: {
                        default: "./dist/index.js",
                        development: "./dist/index.development.js",
                        production: "./dist/index.production.js",
                    },
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["index.development.cjs", /= "development"/],
            ["index.development.mjs", /= "development"/],
            ["index.production.cjs", /= "production"/],
            ["index.production.mjs", /= "production"/],
            // In vitest the NODE_ENV is set to test
            ["index.js", /= "test"/],
            ["index.mjs", /= "test"/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should work with dev and prod optimize conditions in nested-convention", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.production.ts`, `export const value = process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.development.ts`, `export const value = process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.ts`, `export const value = 'core';`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.production.ts`, `export const value = 'core' + process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.development.ts`, `export const value = 'core' + process.env.NODE_ENV;`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        development: "./dist/index.development.mjs",
                        production: "./dist/index.production.mjs",
                    },
                    require: {
                        default: "./dist/index.js",
                        development: "./dist/index.development.js",
                        production: "./dist/index.production.js",
                    },
                },
                "./core": {
                    import: {
                        default: "./dist/core.mjs",
                        development: "./dist/core.development.mjs",
                        production: "./dist/core.production.mjs",
                    },
                    require: {
                        default: "./dist/core.js",
                        development: "./dist/core.development.js",
                        production: "./dist/core.production.js",
                    },
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["index.development.cjs", /= "development"/],
            ["index.development.mjs", /= "development"/],
            ["index.production.cjs", /= "production"/],
            ["index.production.mjs", /= "production"/],
            // In vitest the NODE_ENV is set to test
            ["index.js", /= "test"/],
            ["index.mjs", /= "test"/],

            // core export
            ["core.development.js", /= 'core' \+ "development"/],
            ["core.development.mjs", /= 'core' \+ "development"/],
            ["core.production.js", /= 'core' \+ "production"/],
            ["core.production.mjs", /= 'core' \+ "production"/],
            ["core.js", /= 'core'/],
            ["core.mjs", /= 'core'/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should generate proper assets for rsc condition with ts", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export default 'index';
export const shared = true;

export type IString = string;`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-native.ts`, `export default 'react-native';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-server.ts`, `export default 'react-server';`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/api/index.ts`,
            `import index, { type IString } from '../index';

export default 'api:' + index;
export { IString };`,
        );
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    "react-native": "./dist/react-native.js",
                    "react-server": "./dist/react-server.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
                "./api": {
                    import: "./dist/api.mjs",
                    require: "./dist/api.cjs",
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["./index.mjs", /const shared = true/],
            ["./react-server.mjs", /'react-server'/],
            ["./react-native.js", /'react-native'/],
            ["./index.d.ts", /declare const shared = true/],
            ["./api.mjs", /'pkg-export-ts-rsc'/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should work with nested path in exports", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/foo/bar.js`, `export const value = 'foo.bar';`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                "./foo/bar": "./dist/foo/bar.js",
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const content = readFileSync(`${temporaryDirectoryPath}/dist/foo/bar.js`);

        expect(content).toMatch("export const value = 'foo.bar';");
    });

    it("should work with ESM package with CJS main field", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const value = 'cjs';`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            main: "./dist/index.cjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const value = "cjs";

export { value };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const value = "cjs";

exports.value = value;
`);
    });

    it("should deduplicate entries", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'cjs';`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                import: {
                    default: "./dist/index.mjs",
                    types: "./dist/index.d.mts",
                },
                require: {
                    default: "./dist/index.cjs",
                    types: "./dist/index.d.cts",
                },
            },
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            types: "./dist/index.d.ts",
        });
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {});

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        expect(files).toHaveLength(5);
    });

    it("should work with index file inside index directory", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index/index.js`, `export const index = 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index/index.react-server.js`, `export const index = 'react-server';`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                default: "./dist/index.js",
                "react-server": "./dist/react-server.js",
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["index.js", /'index'/],
            ["react-server.js", /'react-server'/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should export dual package for type module", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                allowJs: true,
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                import: "./dist/index.mjs",
                require: "./dist/index.cjs",
            },
            main: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

module.exports = index;
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

export { index as default };
`);
    });

    it("should export dual package for type commonjs", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {
            compilerOptions: {
                allowJs: true,
            },
        });
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                import: "./dist/index.mjs",
                require: "./dist/index.cjs",
            },
            main: "./dist/index.cjs",
            type: "commonjs",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

module.exports = index;
`);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

export { index as default };
`);
    });
});
