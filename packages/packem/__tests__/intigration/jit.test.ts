import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem build --jit", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should build a package with jit", async () => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        createTsConfig(temporaryDirectoryPath, {});
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
            types: "./dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath, { declaration: false });

        const binProcess = await execPackemSync("build", ["--jit"], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent)
            .toBe(`const jiti = require("/home/prisis/WebstormProjects/visulima/packem/node_modules/.pnpm/jiti@1.21.6/node_modules/jiti/lib/index.js")

const _jiti = jiti(null, {
  "alias": {},
  "esmResolve": true,
  "interopDefault": true
})

/** @type {import("${temporaryDirectoryPath}/src/index")} */
module.exports = _jiti("${temporaryDirectoryPath}/src/index.ts")`);

        const cDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.cts`);

        expect(cDtsContent).toBe(`export * from "${temporaryDirectoryPath}/src/index";
export { default } from "${temporaryDirectoryPath}/src/index";`);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import jiti from "/home/prisis/WebstormProjects/visulima/packem/node_modules/.pnpm/jiti@1.21.6/node_modules/jiti/lib/index.js";

const _jiti = jiti(null, {
  "alias": {},
  "esmResolve": true,
  "interopDefault": true
})

/** @type {import("${temporaryDirectoryPath}/src/index.ts")} */
const _module = await _jiti.import("${temporaryDirectoryPath}/src/index.ts");

export default _module;`);

        const mDtsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(mDtsContent).toBe(`export * from "${temporaryDirectoryPath}/src/index.ts";
export { default } from "${temporaryDirectoryPath}/src/index.ts";`);
    });
});
