import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync } from "../helpers";

describe("packem shims", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should include esm shim, if dirname, filename or require are found", async () => {
        expect.assertions(10);

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
        writeFileSync(
            `${temporaryDirectoryPath}/src/custom-require.js`,
            `const __getOwnPropNames = Object.getOwnPropertyNames
var __commonJS = (cb, mod) =>
  function __require() {
    return (
      mod ||
        (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod),
      mod.exports
    )
  }

export const a = 1`,
        );

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                "./custom-require": {
                    import: "./dist/custom-require.mjs",
                    require: "./dist/custom-require.cjs",
                },
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

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.mjs`);

        expect(mjsDirnameContent).toBe(`import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
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

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

exports.getDirname = getDirname;
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toBe(`import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
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

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

exports.getFilename = getFilename;
`);

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(mjsRequireContent).toBe(`import require$$0 from 'node:fs';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require$$0;
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

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const require$$0 = require('node:fs');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const require$$0__default = /*#__PURE__*/_interopDefaultCompat(require$$0);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require$$0__default;
}
__name(getRequireModule, "getRequireModule");
function esmImport() {
  return (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('require.cjs', document.baseURI).href));
}
__name(esmImport, "esmImport");

exports.esmImport = esmImport;
exports.getRequireModule = getRequireModule;
`);

        const mjsCustomRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/custom-require.mjs`);

        expect(mjsCustomRequireContent).toBe(`const a = 1;

export { a };
`);

        const cjsCustomRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/custom-require.cjs`);

        expect(cjsCustomRequireContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const a = 1;

exports.a = a;
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
        await createPackageJson(temporaryDirectoryPath, {
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

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.mjs`);

        expect(mjsDirnameContent).toBe(`const __dirname = import.meta.dirname; // -- packem CommonJS __dirname shim --
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

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

exports.getDirname = getDirname;
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toBe(`const __filename = import.meta.filename; // -- packem CommonJS __filename shim --
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

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

exports.getFilename = getFilename;
`);

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(mjsRequireContent).toBe(`import require$$0 from 'node:fs';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require$$0;
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

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const require$$0 = require('node:fs');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const require$$0__default = /*#__PURE__*/_interopDefaultCompat(require$$0);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getRequireModule() {
  return require$$0__default;
}
__name(getRequireModule, "getRequireModule");
function esmImport() {
  return (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('require.cjs', document.baseURI).href));
}
__name(esmImport, "esmImport");

exports.esmImport = esmImport;
exports.getRequireModule = getRequireModule;
`);
    });

    it("should not include esm shim, if dirname, filename or require are not found", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `const test = "this should be in final bundle";\nexport default test;`);
        await createPackageJson(temporaryDirectoryPath, {
            module: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
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
        await createPackageJson(temporaryDirectoryPath, {
            module: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
export { getFilename } from './packem_shared/getFilename-CyjjIqAi.mjs';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

export { getDirname };
`);

        const mjsSharedContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/getFilename-CyjjIqAi.mjs`);

        expect(mjsSharedContent).toBe(`import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getFilename() {
  return __filename;
}
__name(getFilename, "getFilename");

export { getFilename };
`);
    });

    it.todo("should include esm shim only once per file on the same dir level, if dirname, filename or require are found", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/level2/filename.js`,
            `export function getFilename() {
  return __filename
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `export function getDirname() {
  return __dirname
}

export { getFilename } from "./level2/filename.js";`,
        );
        await createPackageJson(temporaryDirectoryPath, {
            module: "./dist/index.mjs",
            type: "module",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
export { getFilename } from './packem_shared/getFilename-CyjjIqAi.mjs';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

export { getDirname };
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/getFilename-CyjjIqAi.mjs`);

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
