import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem output", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should generate output with all exports", async () => {
        expect.assertions(19);

        writeFileSync(`${temporaryDirectoryPath}/src/bin/cli.js`, `export const cli = 'cli';`);
        writeFileSync(`${temporaryDirectoryPath}/src/foo.js`, `export const foo = 'foo'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.js`, `export const index = 'index'`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.react-server.js`, `export const index = 'index.react-server'`);
        createPackageJson(temporaryDirectoryPath, {
            bin: {
                cli: "./dist/bin/cli.cjs",
            },
            exports: {
                ".": {
                    import: "./dist/index.cjs",
                    "react-server": "./dist/index.react-server.cjs",
                },
                "./foo": "./dist/foo.cjs",
            },
            name: "@scope/output-app",
        });
        createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", ["--no-color"], {
            cwd: temporaryDirectoryPath,
        });

        const stdout = await streamToString(binProcess.stdout);

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");

        expect(stdout).toContain("Build succeeded for output-app");
        expect(stdout).toContain("dist/index.react-server.cjs (total size: 75 Bytes, chunk size: 75 Bytes)");
        expect(stdout).toContain("exports: index");
        expect(stdout).toContain("dist/foo.cjs (total size: 54 Bytes, chunk size: 54 Bytes)");
        expect(stdout).toContain("exports: foo");
        expect(stdout).toContain("dist/bin/cli.cjs (total size: 74 Bytes, chunk size: 74 Bytes)");
        expect(stdout).toContain("exports: cli");
        expect(stdout).toContain("dist/index.mjs (total size: 42 Bytes, chunk size: 42 Bytes)");
        expect(stdout).toContain("exports: index");
        expect(stdout).toContain("dist/index.react-server.mjs (total size: 55 Bytes, chunk size: 55 Bytes)");
        expect(stdout).toContain("exports: index");
        expect(stdout).toContain("dist/foo.mjs (total size: 36 Bytes, chunk size: 36 Bytes)");
        expect(stdout).toContain("exports: foo");
        expect(stdout).toContain("dist/bin/cli.mjs (total size: 56 Bytes, chunk size: 56 Bytes)");
        expect(stdout).toContain("exports: cli");
        expect(stdout).toContain("Σ Total dist size (byte size): 714 Bytes");

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`const index = "index";

export { index };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const index = "index";

exports.index = index;
`);
    });
});
