import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";

const BANNER_START_REGEX = /^\/\*! my-lib \| MIT \*\//;
const FOOTER_END_REGEX = /\/\*! end my-lib \*\/$/;
const JS_HEADER_START_REGEX = /^\/\/ js-header/;
const DTS_HEADER_START_REGEX = /^\/\/ dts-header/;

describe("banner & footer", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should prepend a string banner and append a string footer to both CJS and ESM output", async () => {
        expect.assertions(6);

        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const value = 1;`);

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: "./dist/index.mjs",
                    require: "./dist/index.cjs",
                },
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: `banner: "/*! my-lib | MIT */",
    footer: "/*! end my-lib */",`,
        });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
        const cjs = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(mjs).toMatch(BANNER_START_REGEX);
        expect(mjs.trimEnd()).toMatch(FOOTER_END_REGEX);
        expect(cjs).toMatch(BANNER_START_REGEX);
        expect(cjs.trimEnd()).toMatch(FOOTER_END_REGEX);
    });

    it("should target the JS bundle and the declaration files independently via the object form", async () => {
        expect.assertions(5);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export const value: number = 1;`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: { typescript: "*" },
            exports: {
                ".": {
                    import: {
                        default: "./dist/index.mjs",
                        types: "./dist/index.d.mts",
                    },
                },
            },
        });
        await createPackemConfig(temporaryDirectoryPath, {
            config: `banner: { js: "// js-header", dts: "// dts-header" },`,
        });

        const binProcess = await execPackem("build", [], { cwd: temporaryDirectoryPath });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjs = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);
        const dmts = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        // The JS banner lands on the JS bundle, never the declarations.
        expect(mjs).toMatch(JS_HEADER_START_REGEX);
        expect(dmts).toMatch(DTS_HEADER_START_REGEX);
        expect(dmts).not.toContain("js-header");
    });
});
