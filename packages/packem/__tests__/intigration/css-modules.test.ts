import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, execPackemSync } from "../helpers";

describe.todo("packem css modules", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.todo("should support css modules", async () => {
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
        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    copy: {
                        targets: "assets/*",
                    },
                },
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
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
