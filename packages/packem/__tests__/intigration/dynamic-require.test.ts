import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";
import getFileNamesFromDirectory from "../helpers/get-file-names-from-directory";

describe("packem dynamic require", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should handle dynamic require in esm", async () => {
        expect.assertions(7);

        writeFileSync(
            `${temporaryDirectoryPath}/src/foo.js`,
            `import externalLib from 'external-lib'

export function foo() {
  return externalLib.method()
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/required-module.js`,
            `export function method() {
  return 'being-required'
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/index.js`,
            `export function index() {
  require('./required-module').method()
}`,
        );

        await createPackageJson(temporaryDirectoryPath, {
            dependencies: {
                "external-lib": "*",
            },
            exports: {
                ".": {
                    default: "./dist/index.cjs",
                    import: "./dist/index.mjs",
                },
                "./foo": {
                    default: "./dist/foo.cjs",
                    import: "./dist/foo.mjs",
                },
            },
            main: "./dist/index.mjs",
            type: "module",
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                cjsInterop: true,
            },
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        await expect(getFileNamesFromDirectory(`${temporaryDirectoryPath}/dist`)).resolves.toStrictEqual(["foo.cjs", "foo.mjs", "index.cjs", "index.mjs"]);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        // eslint-disable-next-line no-secrets/no-secrets
        expect(mjsContent).toBe(`function getAugmentedNamespace(n) {
  if (Object.prototype.hasOwnProperty.call(n, '__esModule')) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			if (this instanceof a) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

var __defProp$1 = Object.defineProperty;
var __name$1 = (target, value) => __defProp$1(target, "name", { value, configurable: true });
function method() {
  return "being-required";
}
__name$1(method, "method");

const requiredModule = /*#__PURE__*/Object.defineProperty({
	__proto__: null,
	method
}, Symbol.toStringTag, { value: 'Module' });

const require$$0 = /*@__PURE__*/getAugmentedNamespace(requiredModule);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function index() {
  require$$0.method();
}
__name(index, "index");

export { index };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        // eslint-disable-next-line no-secrets/no-secrets
        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

function getAugmentedNamespace(n) {
  if (Object.prototype.hasOwnProperty.call(n, '__esModule')) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			if (this instanceof a) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

var __defProp$1 = Object.defineProperty;
var __name$1 = (target, value) => __defProp$1(target, "name", { value, configurable: true });
function method() {
  return "being-required";
}
__name$1(method, "method");

const requiredModule = /*#__PURE__*/Object.defineProperty({
	__proto__: null,
	method
}, Symbol.toStringTag, { value: 'Module' });

const require$$0 = /*@__PURE__*/getAugmentedNamespace(requiredModule);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function index() {
  require$$0.method();
}
__name(index, "index");

exports.index = index;
`);

        const fooMjsContent = readFileSync(`${temporaryDirectoryPath}/dist/foo.mjs`);

        expect(fooMjsContent).toBe(`import externalLib from 'external-lib';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function foo() {
  return externalLib.method();
}
__name(foo, "foo");

export { foo };
`);

        const fooCjsContent = readFileSync(`${temporaryDirectoryPath}/dist/foo.cjs`);

        expect(fooCjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const externalLib = require('external-lib');

const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

const externalLib__default = /*#__PURE__*/_interopDefaultCompat(externalLib);

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function foo() {
  return externalLib__default.method();
}
__name(foo, "foo");

exports.foo = foo;
`);
    });
});
