import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, execPackemSync, streamToString } from "../helpers";

describe("packem css modules", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should support css modules", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/button.module.css`,
            `.Button {
  border: 1px solid transparent;
  border-radius: 4px;
}`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/button.tsx`,
            `import styles from "./button.module.css";
console.log(styles.Button);
`,
        );
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/button.cjs",
            module: "./dist/button.msj",
            type: "commonjs",
        });

        const binProcess = await execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const buttonCss = readFileSync(`${temporaryDirectoryPath}/dist/button.module.css`);

        expect(buttonCss).toBe(`.Button {
  border: 1px solid transparent;
  border-radius: 4px;
}`);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/button.mjs`);

        expect(mjsContent).toBe(`function log() {
  return 'this should be in final bundle'
}

export { log as effect };
`);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/button.cjs`);

        expect(cjsContent).toBe(`'use strict';

function log() {
  return 'this should be in final bundle'
}

exports.effect = log;
`);
    });
});
