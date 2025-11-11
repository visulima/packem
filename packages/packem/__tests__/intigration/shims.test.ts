import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";

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

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.mjs`);

        expect(mjsDirnameContent).toMatchInlineSnapshot(`
          "import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
          import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --
          const __filename = __cjs_url__.fileURLToPath(import.meta.url);
          const __dirname = __cjs_path__.dirname(__filename);
          function getDirname() {
            return __dirname;
          }

          export { getDirname };
          "
        `)

        const cjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.cjs`);

        expect(cjsDirnameContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          function getDirname() {
            return __dirname;
          }

          exports.getDirname = getDirname;
          "
        `);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toMatchInlineSnapshot(`
          "import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
          const __filename = __cjs_url__.fileURLToPath(import.meta.url);
          function getFilename() {
            return __filename;
          }

          export { getFilename };
          "
        `);

        const cjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.cjs`);

        expect(cjsFilenameContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          function getFilename() {
            return __filename;
          }

          exports.getFilename = getFilename;
          "
        `);

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(mjsRequireContent).toMatchInlineSnapshot(`
          "import require$$0 from 'node:fs';

          function getRequireModule() {
            return require$$0;
          }
          function esmImport() {
            return import.meta.url;
          }

          export { esmImport, getRequireModule };
          "
        `);

        const cjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.cjs`);

        expect(cjsRequireContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          const require$$0 = require('node:fs');

          var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
          const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

          const require$$0__default = /*#__PURE__*/_interopDefaultCompat(require$$0);

          function getRequireModule() {
            return require$$0__default;
          }
          function esmImport() {
            return (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('require.cjs', document.baseURI).href));
          }

          exports.esmImport = esmImport;
          exports.getRequireModule = getRequireModule;
          "
        `);

        const mjsCustomRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/custom-require.mjs`);

        expect(mjsCustomRequireContent).toMatchInlineSnapshot(`
          "const a = 1;

          export { a };
          "
        `);

        const cjsCustomRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/custom-require.cjs`);

        expect(cjsCustomRequireContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          const a = 1;

          exports.a = a;
          "
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

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.mjs`);

        expect(mjsDirnameContent).toMatchInlineSnapshot(`
          "const __dirname = import.meta.dirname; // -- packem CommonJS __dirname shim --
          function getDirname() {
            return __dirname;
          }

          export { getDirname };
          "
        `);

        const cjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.cjs`);

        expect(cjsDirnameContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          function getDirname() {
            return __dirname;
          }

          exports.getDirname = getDirname;
          "
        `);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(mjsFilenameContent).toMatchInlineSnapshot(`
          "const __filename = import.meta.filename; // -- packem CommonJS __filename shim --
          function getFilename() {
            return __filename;
          }

          export { getFilename };
          "
        `);

        const cjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.cjs`);

        expect(cjsFilenameContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          function getFilename() {
            return __filename;
          }

          exports.getFilename = getFilename;
          "
        `);

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(mjsRequireContent).toMatchInlineSnapshot(`
          "import require$$0 from 'node:fs';

          function getRequireModule() {
            return require$$0;
          }
          function esmImport() {
            return import.meta.url;
          }

          export { esmImport, getRequireModule };
          "
        `);

        const cjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.cjs`);

        expect(cjsRequireContent).toMatchInlineSnapshot(`
          "'use strict';

          Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

          const require$$0 = require('node:fs');

          var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
          const _interopDefaultCompat = e => e && typeof e === 'object' && 'default' in e ? e.default : e;

          const require$$0__default = /*#__PURE__*/_interopDefaultCompat(require$$0);

          function getRequireModule() {
            return require$$0__default;
          }
          function esmImport() {
            return (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('require.cjs', document.baseURI).href));
          }

          exports.esmImport = esmImport;
          exports.getRequireModule = getRequireModule;
          "
        `);
    });

    it("should not include esm shim, if dirname, filename or require are not found", async () => {
        expect.assertions(3);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `const test = "this should be in final bundle";\nexport default test;`);
        await createPackageJson(temporaryDirectoryPath, {
            module: "./dist/index.js",
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mjsContent).toMatchInlineSnapshot(`
          "const test = "this should be in final bundle";

          export { test as default };
          "
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
            module: "./dist/index.js",
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mjsContent).toMatchInlineSnapshot(`
          "import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
          import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --
          const __filename = __cjs_url__.fileURLToPath(import.meta.url);
          const __dirname = __cjs_path__.dirname(__filename);
          export { getFilename } from './packem_shared/getFilename-CsjQ9lO1.js';

          function getDirname() {
            return __dirname;
          }

          export { getDirname };
          "
        `);

        const mjsSharedContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/getFilename-CsjQ9lO1.js`);

        expect(mjsSharedContent).toMatchInlineSnapshot(`
          "import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
          const __filename = __cjs_url__.fileURLToPath(import.meta.url);
          function getFilename() {
            return __filename;
          }

          export { getFilename };
          "
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
            module: "./dist/index.js",
            type: "module",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.js`);

        expect(mjsContent).toMatchInlineSnapshot(`import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --
import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
export { getFilename } from './packem_shared/getFilename-CyjjIqAi.js';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
function getDirname() {
  return __dirname;
}
__name(getDirname, "getDirname");

export { getDirname };
`);

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/packem_shared/getFilename-CyjjIqAi.js`);

        expect(mjsFilenameContent).toMatchInlineSnapshot(`
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
