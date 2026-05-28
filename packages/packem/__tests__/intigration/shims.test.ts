import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
// eslint-disable-next-line e18e/ban-dependencies -- tempy is core test-runner infra; fs.mkdtemp migration tracked separately
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";
import { normalizeBundleOutput } from "../helpers/testing-utils";

const GET_FILENAME_SHARED_IMPORT_REGEX = /(?:import|export) \{ getFilename \} from '\.\/packem_shared\/getFilename-[^']+\.js'/;

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

        expect(normalizeBundleOutput(mjsDirnameContent)).toMatchSnapshot("dirname.mjs output");

        const cjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.cjs`);

        expect(normalizeBundleOutput(cjsDirnameContent)).toMatchSnapshot("dirname.cjs output");

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(normalizeBundleOutput(mjsFilenameContent)).toMatchSnapshot("filename.mjs output");

        const cjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.cjs`);

        expect(normalizeBundleOutput(cjsFilenameContent)).toMatchSnapshot("filename.cjs output");

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(normalizeBundleOutput(mjsRequireContent)).toMatchSnapshot("require.mjs output");

        const cjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.cjs`);

        expect(normalizeBundleOutput(cjsRequireContent)).toMatchSnapshot("require.cjs output");

        const mjsCustomRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/custom-require.mjs`);

        expect(normalizeBundleOutput(mjsCustomRequireContent)).toMatchSnapshot("custom-require.mjs output");

        const cjsCustomRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/custom-require.cjs`);

        expect(normalizeBundleOutput(cjsCustomRequireContent)).toMatchSnapshot("custom-require.cjs output");
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

        expect(normalizeBundleOutput(mjsDirnameContent)).toMatchSnapshot("dirname.mjs output");

        const cjsDirnameContent = readFileSync(`${temporaryDirectoryPath}/dist/dirname.cjs`);

        expect(normalizeBundleOutput(cjsDirnameContent)).toMatchSnapshot("dirname.cjs output");

        const mjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.mjs`);

        expect(normalizeBundleOutput(mjsFilenameContent)).toMatchSnapshot("filename.mjs output");

        const cjsFilenameContent = readFileSync(`${temporaryDirectoryPath}/dist/filename.cjs`);

        expect(normalizeBundleOutput(cjsFilenameContent)).toMatchSnapshot("filename.cjs output");

        const mjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.mjs`);

        expect(normalizeBundleOutput(mjsRequireContent)).toMatchSnapshot("require.mjs output");

        const cjsRequireContent = readFileSync(`${temporaryDirectoryPath}/dist/require.cjs`);

        expect(normalizeBundleOutput(cjsRequireContent)).toMatchSnapshot("require.cjs output");
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

        expect(normalizeBundleOutput(mjsContent)).toMatchSnapshot();
    });

    it("should include esm shim only once per file, if dirname, filename or require are found", async () => {
        expect.assertions(14);

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

        // Hash-independent structural check: chunk import + cjs shims + exports.
        const normalizedMjs = normalizeBundleOutput(mjsContent);

        expect(normalizedMjs).toMatch(GET_FILENAME_SHARED_IMPORT_REGEX);
        expect(normalizedMjs).toContain("import __cjs_url__ from 'node:url'");
        expect(normalizedMjs).toContain("import __cjs_path__ from 'node:path'");
        expect(normalizedMjs).toContain("const __filename = __cjs_url__.fileURLToPath(import.meta.url);");
        expect(normalizedMjs).toContain("const __dirname = __cjs_path__.dirname(__filename);");
        expect(normalizedMjs).toContain("getDirname");
        expect(normalizedMjs).toContain("getFilename");

        const sharedDirectory = `${temporaryDirectoryPath}/dist/packem_shared`;
        const chunkFile = readdirSync(sharedDirectory).find((f) => f.startsWith("getFilename-"));

        expect(chunkFile).toBeDefined();

        const mjsSharedContent = readFileSync(`${sharedDirectory}/${String(chunkFile)}`);
        const normalizedShared = normalizeBundleOutput(mjsSharedContent);

        expect(normalizedShared).toContain("import __cjs_url__ from 'node:url'");
        expect(normalizedShared).toContain("const __filename = __cjs_url__.fileURLToPath(import.meta.url);");
        expect(normalizedShared).toContain("function getFilename()");
        expect(normalizedShared).toContain("export { getFilename }");
    });

    it("should include esm shim only once per file on the same dir level, if dirname, filename or require are found", async () => {
        expect.assertions(14);

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

        const mjsContent = normalizeBundleOutput(readFileSync(`${temporaryDirectoryPath}/dist/index.js`));

        // Verify entry shims are present and the chunk is re-exported (hash-independent check)
        expect(mjsContent).toContain("import __cjs_url__ from 'node:url'");
        expect(mjsContent).toContain("import __cjs_path__ from 'node:path'");
        expect(mjsContent).toContain("const __dirname = __cjs_path__.dirname(__filename);");
        expect(mjsContent).toContain("getFilename");
        expect(mjsContent).toContain("getDirname");

        // Verify each shim import appears exactly once in the entry file
        const entryUrlShimCount = mjsContent.match(/import __cjs_url__/g);
        const entryPathShimCount = mjsContent.match(/import __cjs_path__/g);

        expect(entryUrlShimCount).toHaveLength(1);
        expect(entryPathShimCount).toHaveLength(1);

        // Find the chunk file dynamically (hash changes across builds)
        const sharedDirectory = `${temporaryDirectoryPath}/dist/packem_shared`;
        const chunkFile = readdirSync(sharedDirectory).find((f) => f.startsWith("getFilename-"));

        expect(chunkFile).toBeDefined();

        const mjsFilenameContent = normalizeBundleOutput(readFileSync(`${sharedDirectory}/${String(chunkFile)}`));

        // Verify the chunk has its own shim for __filename (not duplicated from entry)
        expect(mjsFilenameContent).toContain("import __cjs_url__ from 'node:url'");
        expect(mjsFilenameContent).toContain("const __filename = __cjs_url__.fileURLToPath(import.meta.url)");
        expect(mjsFilenameContent).toContain("export { getFilename }");

        // Verify the chunk shim appears exactly once
        const chunkUrlShimCount = mjsFilenameContent.match(/import __cjs_url__/g);

        expect(chunkUrlShimCount).toHaveLength(1);
    });
});
