import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";
import temporaryDirectory from "../helpers/temporary-directory";

const SHARED_EFFECT_MJS_REGEX = /packem_shared\/effect-[\w-]+\.mjs/;
const SHARED_EFFECT_CJS_REGEX = /packem_shared\/effect-[\w-]+\.cjs/;
const EFFECT_WORD_REGEX = /\beffect\b/;

describe("packem resolve-file-url", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory({
            prefix: "packem-resolve-file-url",
        });
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should resolve import with file:// annotation", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/importee.mjs`,
            `function log() {
  return 'this should be in final bundle'
}

export default log`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/importer.mjs`, `export { default as effect } from "file://${temporaryDirectoryPath}/src/importee.mjs"`);

        await createPackemConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            main: "./dist/importer.cjs",
            module: "./dist/importer.mjs",
            type: "commonjs",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/importer.mjs`);

        // Both bundlers re-emit the file:// importee as a packem_shared chunk
        // and re-export its default as `effect`. Rollup emits a single
        // `export { default as effect } from './chunk.mjs'` line; rolldown
        // splits it into `import X from './chunk.mjs'; export { X as effect };`.
        // Structural checks tolerate either form while still catching plugin
        // regressions (resolution + chunk emit + re-export wiring).
        expect(mjsContent).toMatch(SHARED_EFFECT_MJS_REGEX);
        expect(mjsContent).toMatch(EFFECT_WORD_REGEX);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/importer.cjs`);

        expect(cjsContent).toMatch(SHARED_EFFECT_CJS_REGEX);
        expect(cjsContent).toMatch(EFFECT_WORD_REGEX);
    });
});
