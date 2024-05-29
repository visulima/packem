import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync, streamToString } from "../helpers";

describe("packem raw data", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        createPackemConfig(temporaryDirectoryPath, {});
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should generate js files with included raw content", async () => {
        expect.assertions(6);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import content from './content.txt'

export const data = content;`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/content.txt`, `thisismydata`);
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
        });

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsTextContent = readFileSync(`${temporaryDirectoryPath}/dist/content.txt.mjs`);

        expect(mjsTextContent).toBe(`const content = "thisismydata";

export { content as default };
`);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toBe(`import content from './content.txt.mjs';

const data = content;

export { data };
`);

        const cjsTextContent = readFileSync(`${temporaryDirectoryPath}/dist/content.txt.cjs`);

        expect(cjsTextContent).toBe(`'use strict';

const content = "thisismydata";

module.exports = content;
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toBe(`'use strict';

const content = require('./content.txt.cjs');

const data = content;

exports.data = data;
`);
    });
});
