import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem copy", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should not trigger a warning if alias option is used", async () => {
        expect.assertions(4);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `console.log("Hello, world!");`);
        writeFileSync(`${temporaryDirectoryPath}/assets/style.css`, `body { background-color: red; }`);
        writeFileSync(`${temporaryDirectoryPath}/assets/data.csv`, `name,age`);
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            type: "commonjs",
        });
        createPackemConfig(temporaryDirectoryPath, {
            rollup: {
                copy: {
                    targets: "assets/*",
                },
            },
        });

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(`${temporaryDirectoryPath}/dist/style.css`)).toBeTruthy();
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(`${temporaryDirectoryPath}/dist/data.csv`)).toBeTruthy();
    });
});