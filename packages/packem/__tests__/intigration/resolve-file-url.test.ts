import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync } from "../helpers";

describe("packem resolve-file-url", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath, {});
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should resolve import with file:// annotation", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/importee.mjs`,
            `function log() {
  return 'this should be in final bundle'
}

export default log`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/importer.mjs`, `export { default as effect } from "file://${temporaryDirectoryPath}/src/importee.mjs"`);
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/importer.cjs",
            module: "./dist/importer.mjs",
            type: "commonjs",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/importer.mjs`);

        expect(mjsContent).toBe(`export { default as effect } from './packem_shared/effect-U3Biba7s.mjs';
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/importer.cjs`);

        expect(cjsContent).toBe(`'use strict';

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const effect = require('./packem_shared/effect-2dEibUu8.cjs');



exports.effect = effect;
`);
    });
});
