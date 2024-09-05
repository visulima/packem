import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

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

        expect(binProcess.stderr).toBe("");
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

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const file of ["index.cjs", "index.mjs"]) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            expect(existsSync(`${temporaryDirectoryPath}/dist/${file}`)).toBeTruthy();
        }
    });

    it("should work with dev and prod optimize conditions", async () => {
        expect.assertions(8);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = process.env.NODE_ENV;`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
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

        const binProcess = await execPackemSync("build", ["--no-environment"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["index.development.cjs", /= "development"/],
            ["index.development.mjs", /= "development"/],
            ["index.production.cjs", /="production"/],
            ["index.production.mjs", /="production"/],
            // In vitest the NODE_ENV is set to test
            ["index.cjs", /process.env.NODE_ENV/],
            ["index.mjs", /process.env.NODE_ENV/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should work with dev and prod optimize conditions in nested-convention", async () => {
        expect.assertions(14);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'index';`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.production.ts`, `export const value = process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.development.ts`, `export const value = process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.ts`, `export const value = 'core';`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.production.ts`, `export const value = 'core' + process.env.NODE_ENV;`);
        writeFileSync(`${temporaryDirectoryPath}/src/core.development.ts`, `export const value = 'core' + process.env.NODE_ENV;`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
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

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["index.development.cjs", /= "development"/],
            ["index.development.mjs", /= "development"/],
            ["index.production.cjs", /="production"/],
            ["index.production.mjs", /="production"/],
            ["index.cjs", /= "index"/],
            ["index.mjs", /= "index"/],

            // core export
            ["core.development.cjs", /= "coredevelopment"/],
            ["core.development.mjs", /= "coredevelopment"/],
            ["core.production.cjs", /="coreproduction"/],
            ["core.production.mjs", /="coreproduction"/],
            ["core.cjs", /= "core"/],
            ["core.mjs", /= "core"/],
        ]) {
            const content = readFileSync(`${temporaryDirectoryPath}/dist/${file as string}`);

            expect(content).toMatch(regex as RegExp);
        }
    });

    it("should generate proper assets for rsc condition with ts", async () => {
        expect.assertions(8);

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

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    "react-native": "./dist/index.react-native.cjs",
                    "react-server": "./dist/index.react-server.mjs",
                    require: "./dist/index.cjs",
                    types: "./dist/index.d.ts",
                },
                "./api": {
                    import: "./dist/api/index.mjs",
                    require: "./dist/api/index.cjs",
                },
            },
        });

        const binProcess = await execPackemSync("build", ["--no-environment"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [file, regex] of [
            ["./index.mjs", /const shared = true/],
            ["./index.react-server.mjs", /"react-server"/],
            ["./index.react-native.cjs", /"react-native"/],
            ["./index.d.ts", /declare const shared = true/],
            ["./api/index.cjs", /"api:"/],
            ["./api/index.mjs", /"api:"/],
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

        expect(binProcess.stderr).toBe("");
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

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });

    it("should deduplicate entries", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value = 'cjs';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
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

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = readdirSync(join(temporaryDirectoryPath, "dist"));

        expect(files).toHaveLength(5);
    });

    it("should export dual package for type module", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
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

        expect(binProcess.stderr).toBe("");
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

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
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

        expect(binProcess.stderr).toBe("");
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

        expect(binProcess.stderr).toBe("");

        expect(binProcess.stdout).toContain("Build succeeded for output-app");
        expect(binProcess.stdout).toContain("dist/index.react-server.cjs (total size: 149 Bytes, chunk size: 149 Bytes)");
        expect(binProcess.stdout).toContain("exports: index");
        expect(binProcess.stdout).toContain("dist/foo.cjs (total size: 128 Bytes, chunk size: 128 Bytes)");
        expect(binProcess.stdout).toContain("exports: foo");
        expect(binProcess.stdout).toContain("dist/bin/cli.cjs (total size: 148 Bytes, chunk size: 148 Bytes)");
        expect(binProcess.stdout).toContain("exports: cli");
        expect(binProcess.stdout).toContain("Σ Total dist size (byte size): 741 Bytes");

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

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
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

        expect(binProcess.stderr).toBe("");
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

    it("should throw a error if exports is mjs file without type module in package.json", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.mjs",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`Exported file "./dist/index.mjs" has an extension that does not match the package.json type "commonjs"`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should throw a error if exports is cjs file with type module in package.json", async () => {
        expect.assertions(2);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            exports: "./dist/index.cjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toContain(`Exported file "./dist/index.cjs" has an extension that does not match the package.json type "module"`);
        expect(binProcess.exitCode).toBe(1);
    });

    it("should work with single entry", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: "./dist/index.cjs",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

module.exports = index;
`);
    });

    it("should work with multi entries", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/server/index.edge-light.ts`, `export const name = "server.edge-light";`);
        writeFileSync(`${temporaryDirectoryPath}/src/server/index.react-server.ts`, `export const name = "server.react-server";`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/server/index.ts`,
            `import { type Client } from "../client";
import { type Shared } from "../shared";

export const name = "server.index";
export const main = true;

export { Client, Shared };
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/client.ts`,
            `import { type Shared } from "./shared";

export default function client(c: string) {
    return "client" + c;
}

export type Client = string;
export { Shared };
`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default "index";`);
        writeFileSync(
            `${temporaryDirectoryPath}/src/lite.ts`,
            `export default function lite(c: string) {
    return "lite" + c;
}
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/shared.edge-light.ts`,
            `export default "shared.edge-light";
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/shared.ts`,
            `export default "shared";

export type Shared = string;
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": "./dist/index.cjs",
                "./client": {
                    import: "./dist/client.mjs",
                    require: "./dist/client.cjs",
                    types: "./dist/client.d.ts",
                },
                "./lite": "./dist/lite.cjs",
                "./package.json": "./package.json",
                "./server": {
                    "edge-light": "./dist/server/index.edge.mjs",
                    import: "./dist/server/index.mjs",
                    "react-server": "./dist/server/index.react-server.mjs",
                    types: "./dist/server/index.d.mts",
                },
                "./shared": {
                    "edge-light": "./dist/shared.edge-light.mjs",
                    import: "./dist/shared.mjs",
                    require: "./dist/shared.cjs",
                },
            },
            name: "multi-entries",
            types: "./dist/index.d.ts",
            version: "0.0.0",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsIndexContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsIndexContent).toBe(`'use strict';

const index = "index";

module.exports = index;
`);

        const cjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/client.cjs`);

        expect(cjsClientContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function client(c) {
  return "client" + c;
}
__name(client, "client");

module.exports = client;
`);
    });

    it("should work with multi types", async () => {
        expect.assertions(5);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const index = "index";`);

        await installPackage(temporaryDirectoryPath, "typescript");
        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.cjs",
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                    require: {
                        default: "./dist/index.cjs",
                        types: "./dist/index.d.cts",
                    },
                },
                "./package.json": "./package.json",
            },
            name: "multi-entries-multi-types",
            types: "./dist/index.d.ts",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const index = "index";

export { index };
`);

        const cjsDts = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cjsDts).toBe(`declare const index = "index";

export { index };
`);

        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjs).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const index = "index";

exports.index = index;
`);
    });

    it("should work with edge export condition", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const isEdge = process.env.EdgeRuntime;`);

        createTsConfig(temporaryDirectoryPath, {});
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                "edge-light": "./dist/index.edge.mjs",
                import: "./dist/index.mjs",
            },
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjs).toBe(`const isEdge = false;

export { isEdge };
`);

        const mjsEdgeLight = readFileSync(`${temporaryDirectoryPath}/dist/index.edge.mjs`);

        expect(mjsEdgeLight).toBe(`const isEdge = true;

export { isEdge };
`);
    });

    it("should generate proper assets for each exports for server components with same layer", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `"use client";

import React, { useState } from "react";

export function Button() {
    const [count] = useState(0);
    return React.createElement("button", \`count: \${count}\`);
}

export { Client } from "./_client";
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_client.js`,
            `"use client";

export function Client() {
    return "client-module";
}
`,
        );

        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
            peerDependencies: {
                react: "*",
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`'use client';
import React, { useState } from 'react';
export { C as Client } from './shared/Client-DWTUoKrV.mjs';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function Button() {
  const [count] = useState(0);
  return React.createElement("button", \`count: \${count}\`);
}
__name(Button, "Button");

export { Button };
`);

        const mjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/shared/Client-DWTUoKrV.mjs`);

        expect(mjsClientContent).toBe(`'use client';
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function Client() {
  return "client-module";
}
__name(Client, "Client");

export { Client as C };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const React = require('react');
const Client = require('./shared/Client-CjMHur1x.cjs');

const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const React__default = /*#__PURE__*/_interopDefaultCompat(React);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function Button() {
  const [count] = React.useState(0);
  return React__default.createElement("button", \`count: \${count}\`);
}
__name(Button, "Button");

exports.Client = Client.Client;
exports.Button = Button;
`);

        const cjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/shared/Client-CjMHur1x.cjs`);

        expect(cjsClientContent).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function Client() {
  return "client-module";
}
__name(Client, "Client");

exports.Client = Client;
`);
    });

    it("should generate proper assets for each exports for server components", async () => {
        expect.assertions(8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `export { Button, Client as UIClient } from "./ui";
export { action } from "./_actions";
export { Client } from "./_client";
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/ui.js`,
            `"use client";

import React, { useState } from "react";

export function Button() {
    const [count] = useState(0);
    return React.createElement("button", \`count: \${count}\`);
}

export { Client } from "./_client";
export { asset } from "./_asset";
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_client.js`,
            `"use client";

export function Client() {
    return "client-module";
}
`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_actions.js`,
            `"use server";

export async function action() {
    return "server-action";
}`,
        );

        writeFileSync(
            `${temporaryDirectoryPath}/src/_asset.js`,
            `"use client";

export const asset = "asset-module";
`,
        );

        createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
                "./ui": {
                    import: "./dist/ui.mjs",
                    require: "./dist/ui.cjs",
                },
            },
            peerDependencies: {
                react: "*",
            },
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`export { B as Button } from './ui.mjs';
export { a as action } from './shared/action-CHfTqOfG.mjs';
export { C as Client, C as UIClient } from './shared/Client-DWTUoKrV.mjs';
`);

        const mjsActionContent = readFileSync(`${temporaryDirectoryPath}/dist/shared/action-CHfTqOfG.mjs`);

        expect(mjsActionContent).toBe(`'use server';
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function action() {
  return "server-action";
}
__name(action, "action");

export { action as a };
`);

        const mjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/shared/Client-DWTUoKrV.mjs`);

        expect(mjsClientContent).toBe(`'use client';
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function Client() {
  return "client-module";
}
__name(Client, "Client");

export { Client as C };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const ui = require('./ui.cjs');
const action = require('./shared/action-DdW0-Ipg.cjs');
const Client = require('./shared/Client-CjMHur1x.cjs');



exports.Button = ui.Button;
exports.action = action.action;
exports.Client = Client.Client;
exports.UIClient = Client.Client;
`);

        const cjsActionContent = readFileSync(`${temporaryDirectoryPath}/dist/shared/action-DdW0-Ipg.cjs`);

        expect(cjsActionContent).toBe(`'use server';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
async function action() {
  return "server-action";
}
__name(action, "action");

exports.action = action;
`);

        const cjsClientContent = readFileSync(`${temporaryDirectoryPath}/dist/shared/Client-CjMHur1x.cjs`);

        expect(cjsClientContent).toBe(`'use client';
'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function Client() {
  return "client-module";
}
__name(Client, "Client");

exports.Client = Client;
`);
    });
});
