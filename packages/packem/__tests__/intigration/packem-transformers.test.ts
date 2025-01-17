import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem-transformers", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it.each([
        [
            "esbuild",
            `'use strict';

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

module.exports = index;
`,
            `var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const index = /* @__PURE__ */ __name(() => "index", "default");

export { index as default };
`,
        ],
        [
            "swc",
            `'use strict';

function index() {
    return 'index';
}

module.exports = index;
`,
            `function index() {
    return 'index';
}

export { index as default };
`,
        ],
        [
            "sucrase",
            `'use strict';

const index = () => 'index';

module.exports = index;
`,
            `const index = () => 'index';

export { index as default };
`,
        ],
    ])("should transfrom the file with the '%s' transformer", async (transformer, expectedCjs, expectedMjs) => {
        expect.assertions(6);

        await installPackage(temporaryDirectoryPath, "typescript");

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default () => 'index';`);

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(
            temporaryDirectoryPath,
            {
                devDependencies: {
                    typescript: "*",
                },
                main: "./dist/index.cjs",
                module: "./dist/index.mjs",
            },
            transformer as "esbuild" | "swc" | "sucrase",
        );
        await createPackemConfig(temporaryDirectoryPath, { transformer: transformer as "esbuild" | "swc" | "sucrase" });

        expect(readFileSync(`${temporaryDirectoryPath}/packem.config.ts`)).toContain(transformer === "swc" ? "swc/swc-plugin" : `${transformer}/index`);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stdout).contains(transformer);
        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`)).toBe(expectedCjs);
        expect(readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`)).toBe(expectedMjs);
    });
});
