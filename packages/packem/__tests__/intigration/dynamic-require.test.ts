import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackem } from "../helpers";
import getFileNamesFromDirectory from "../helpers/get-file-names-from-directory";
import temporaryDirectory from "../helpers/temporary-directory";

const isRolldown = process.env.PACKEM_TEST_BUNDLER === "rolldown";

describe("packem dynamic require", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    // Rolldown extracts the dynamically-required module into a shared chunk
    // (`packem_shared/chunk-*.cjs`) instead of inlining it, so the dist file
    // list contains a fifth entry. Rollup emits exactly the four entry files.
    it.runIf(!isRolldown)("should handle dynamic require in esm", async () => {
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

        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toMatchSnapshot("mjs");
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toMatchSnapshot("cjs");
        expect(readFileSync(`${temporaryDirectoryPath}/dist/foo.mjs`)).toMatchSnapshot("foo.mjs");
        expect(readFileSync(`${temporaryDirectoryPath}/dist/foo.cjs`)).toMatchSnapshot("foo.cjs");
    });
});
