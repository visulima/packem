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
        await createPackemConfig(temporaryDirectoryPath, {});

        const binProcess = await execPackemSync("build", ["--no-color"], {
            cwd: temporaryDirectoryPath,
        });

        const stdout = await streamToString(binProcess.stdout);

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");

        expect(stdout).toContain("Build succeeded for output-app");
        expect(stdout).toContain("dist/index.react-server.cjs (total size: 149 Bytes, chunk size: 149 Bytes)");
        expect(stdout).toContain("exports: index");
        expect(stdout).toContain("dist/foo.cjs (total size: 128 Bytes, chunk size: 128 Bytes)");
        expect(stdout).toContain("exports: foo");
        expect(stdout).toContain("dist/bin/cli.cjs (total size: 148 Bytes, chunk size: 148 Bytes)");
        expect(stdout).toContain("exports: cli");
        expect(stdout).toContain("Σ Total dist size (byte size): 741 Bytes");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const index = "index";

exports.index = index;
`);
    });
});
