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

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
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
        for (const file of ["index.cjs", "index.mjs"]) {
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
                    default: "./dist/index.cjs",
                    import: {
                        default: "./dist/index.mjs",
                        development: "./dist/index.development.mjs",
                        production: "./dist/index.production.mjs",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        development: "./dist/index.development.cjs",
                        production: "./dist/index.production.cjs",
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
            ["index.cjs", /= "test"/],
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
                        default: "./dist/index.cjs",
                        development: "./dist/index.development.cjs",
                        production: "./dist/index.production.cjs",
                    },
                },
                "./core": {
                    import: {
                        default: "./dist/core.mjs",
                        development: "./dist/core.development.mjs",
                        production: "./dist/core.production.mjs",
                    },
                    require: {
                        default: "./dist/core.cjs",
                        development: "./dist/core.development.cjs",
                        production: "./dist/core.production.cjs",
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
            ["index.cjs", /= "test"/],
            ["index.mjs", /= "test"/],

            // core export
            ["core.development.cjs", /= 'core' \+ "development"/],
            ["core.development.mjs", /= 'core' \+ "development"/],
            ["core.production.cjs", /= 'core' \+ "production"/],
            ["core.production.mjs", /= 'core' \+ "production"/],
            ["core.cjs", /= 'core'/],
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
                    "react-native": "./dist/react-native.cjs",
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
            ["./react-native.cjs", /'react-native'/],
            ["./index.d.ts", /declare const shared = true/],
            ["./api.mjs", /'pkg-export-ts-rsc'/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should work with nested path in exports", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/foo/bar.js`, `export const value = 'foo.bar';`);
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                "./foo/bar": "./dist/foo/bar.mjs",
            },
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const content = readFileSync(`${temporaryDirectoryPath}/dist/foo/bar.mjs`);

        expect(content).toMatch(`const value = "foo.bar";

export { value };
`);
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

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });

    it("should deduplicate entries", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'cjs';`);
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
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

    it("should generate output with all cjs exports", async () => {
        expect.assertions(13);

        writeFileSync(`${temporaryDirectoryPath}/src/bin/cli.js`, `export const cli = 'cli';`);
        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = 'foo'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = 'index'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-server.js`, `export const index = 'index.react-server'`);
        createPackageJson(temporaryDirectoryPath, {
            bin: {
                cli: "./dist/bin/cli.cjs",
            },
            exports: {
                ".": {
                    import: "./dist/index.cjs",
                    "react-server": "./dist/index.react-server.cjs",
                },
                "./foo": "./dist/foo.cjs",
            },
            name: "@scope/output-app",
        });

        const binProcess = await execPackemSync("build", ["--no-color"], {
            cwd: temporaryDirectoryPath,
        });

        const stdout = await streamToString(binProcess.stdout);

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");

        expect(stdout).toContain("Build succeeded for output-app");
        expect(stdout).toContain("dist/index.react-server.cjs (total size: 149 Bytes, chunk size: 149 Bytes)");
        expect(stdout).toContain("exports: index");
        expect(stdout).toContain("dist/foo.cjs (total size: 128 Bytes, chunk size: 128 Bytes)");
        expect(stdout).toContain("exports: foo");
        expect(stdout).toContain("dist/bin/cli.cjs (total size: 148 Bytes, chunk size: 148 Bytes)");
        expect(stdout).toContain("exports: cli");
        expect(stdout).toContain("Σ Total dist size (byte size): 741 Bytes");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");

        const cjsReactContent = readFileSync(`${temporaryDirectoryPath}/dist/index.react-server.cjs`);

        expect(cjsReactContent).toMatchSnapshot("cjs output");

        const cjsFooContent = readFileSync(`${temporaryDirectoryPath}/dist/foo.cjs`);

        expect(cjsFooContent).toMatchSnapshot("cjs output");

        const cjsCliContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/cli.cjs`);

        expect(cjsCliContent).toMatchSnapshot("cjs output");
    });

    it("should support wildcard subpath exports", async () => {
        expect.assertions(7);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/pages/a.ts`,
            `export function render() {
    console.log('Page A');
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/pages/b.ts`,
            `export function render() {
    console.log('Page B');
}`,
        );
        writeJsonSync(`${temporaryDirectoryPath}/tsconfig.json`, {});
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": "./dist/index.cjs",
                "./pages/*": {
                    import: "./dist/pages/*.mjs",
                    require: "./dist/pages/*.cjs",
                    types: "./dist/pages/*.d.ts",
                },
            },
            types: "./dist/index.d.ts",
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

        const cjsPageA = readFileSync(`${temporaryDirectoryPath}/dist/pages/a.cjs`);

        expect(cjsPageA).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function render() {
  console.log("Page A");
}
__name(render, "render");

exports.render = render;
`);
        const mjsPageA = readFileSync(`${temporaryDirectoryPath}/dist/pages/a.mjs`);

        expect(mjsPageA).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function render() {
  console.log("Page A");
}
__name(render, "render");

export { render };
`);

        const cjsPageB = readFileSync(`${temporaryDirectoryPath}/dist/pages/b.cjs`);

        expect(cjsPageB).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function render() {
  console.log("Page B");
}
__name(render, "render");

exports.render = render;
`);
        const mjsPageB = readFileSync(`${temporaryDirectoryPath}/dist/pages/b.mjs`);

        expect(mjsPageB).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function render() {
  console.log("Page B");
}
__name(render, "render");

export { render };
`);
    });

    it("should work with single entry", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);
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
