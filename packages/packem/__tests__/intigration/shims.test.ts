import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem shims", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath, {});
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should include esm shim, if dirname, filename or require are found", async () => {
        expect.assertions(8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/dirname.js`,
            `export function getDirname() {
  return __dirname
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/filename.js`,
            `export function getFilename() {
  return __filename
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/require.js`,
            `export function getRequireModule() {
  return require('node:fs')
}

export function esmImport() {
  return import.meta.url
}`,
        );
        createPackageJson(temporaryDirectoryPath, {
            exports: {
                "./dirname": {
                    import: "./dist/dirname.mjs",
                    require: "./dist/dirname.cjs",
                },
                "./filename": {
                    import: "./dist/filename.mjs",
                    require: "./dist/filename.cjs",
                },
                "./require": {
                    import: "./dist/require.mjs",
                    require: "./dist/require.cjs",
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.mjs`);

        expect(mjsDirnameContent).toBe(`
// -- pack CommonJS Shims --
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

export { getDirname };
`);

        const cjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.cjs`);

        expect(cjsDirnameContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

exports.getDirname = getDirname;
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toBe(`
// -- pack CommonJS Shims --
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

export { getFilename };
`);

        const cjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.cjs`);

        expect(cjsFilenameContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

exports.getFilename = getFilename;
`);

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(mjsRequireContent).toBe(`
// -- pack CommonJS Shims --
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require("node:fs");
}
__name(getRequireModule, "getRequireModule");
function esmImport() {
  return import.meta.url;
}
__name(esmImport, "esmImport");

export { esmImport, getRequireModule };
`);

        const cjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.cjs`);

        expect(cjsRequireContent).toBe(`'use strict';

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require("node:fs");
}
__name(getRequireModule, "getRequireModule");
function esmImport() {
  return (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.src || new URL('require.cjs', document.baseURI).href));
}
__name(esmImport, "esmImport");

exports.esmImport = esmImport;
exports.getRequireModule = getRequireModule;
`);
    });

    it("should include esm shim for node >20.11, if dirname, filename or require are found", async () => {
        expect.assertions(8);

        writeFileSync(
            `${temporaryDirectoryPath}/src/dirname.js`,
            `export function getDirname() {
  return __dirname
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/filename.js`,
            `export function getFilename() {
  return __filename
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/require.js`,
            `export function getRequireModule() {
  return require('node:fs')
}

export function esmImport() {
  return import.meta.url
}`,
        );
        createPackageJson(temporaryDirectoryPath, {
            engines: {
                node: "20.11",
            },
            exports: {
                "./dirname": {
                    import: "./dist/dirname.mjs",
                    require: "./dist/dirname.cjs",
                },
                "./filename": {
                    import: "./dist/filename.mjs",
                    require: "./dist/filename.cjs",
                },
                "./require": {
                    import: "./dist/require.mjs",
                    require: "./dist/require.cjs",
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.mjs`);

        expect(mjsDirnameContent).toBe(`
// -- pack CommonJS Shims Node 20.11 --
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

export { getDirname };
`);

        const cjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.cjs`);

        expect(cjsDirnameContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

exports.getDirname = getDirname;
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toBe(`
// -- pack CommonJS Shims Node 20.11 --
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

export { getFilename };
`);

        const cjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.cjs`);

        expect(cjsFilenameContent).toBe(`'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

exports.getFilename = getFilename;
`);

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(mjsRequireContent).toBe(`
// -- pack CommonJS Shims Node 20.11 --
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require("node:fs");
}
__name(getRequireModule, "getRequireModule");
function esmImport() {
  return import.meta.url;
}
__name(esmImport, "esmImport");

export { esmImport, getRequireModule };
`);

        const cjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.cjs`);

        expect(cjsRequireContent).toBe(`'use strict';

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require("node:fs");
}
__name(getRequireModule, "getRequireModule");
function esmImport() {
  return (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.src || new URL('require.cjs', document.baseURI).href));
}
__name(esmImport, "esmImport");

exports.esmImport = esmImport;
exports.getRequireModule = getRequireModule;
`);
    });

    it("should not include esm shim, if dirname, filename or require are not found", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `const test = "this should be in final bundle";\nexport default test;`);
        createPackageJson(temporaryDirectoryPath, {
            module: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const test = "this should be in final bundle";

export { test as default };
`);
    });

    it("should include esm shim only once per file, if dirname, filename or require are found", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/filename.js`,
            `export function getFilename() {
  return __filename
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `export function getDirname() {
  return __dirname
}

export { getFilename } from "./filename.js";`,
        );
        createPackageJson(temporaryDirectoryPath, {
            module: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`
// -- pack CommonJS Shims --
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
export { getFilename } from './filename.mjs';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

export { getDirname };
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toBe(`
// -- pack CommonJS Shims --
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require = __cjs_mod__.createRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

export { getFilename };
`);
    });
});
