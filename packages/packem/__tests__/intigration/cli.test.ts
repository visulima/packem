import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage, streamToString } from "../helpers";

describe("packem typescript", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should support of tsconfig overwrite", async () => {
        expect.assertions(5);

        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `export default class A {}`);
        createTsConfig(
            temporaryDirectoryPath,
            {
                compilerOptions: { target: "es2018" },
            },
            ".build",
        );
        createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "5",
            },
            module: "dist/index.mjs",
            type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);

        await installPackage(temporaryDirectoryPath, "typescript");

        const binProcessEs2018 = await execPackemSync("build", ["--tsconfig=tsconfig.build.json"], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcessEs2018.stderr)).resolves.toBe("");
        expect(binProcessEs2018.exitCode).toBe(0);

        const dMtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const dTsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const dCtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(dCtsContentEs2018).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const _A = class _A {
};
__name(_A, "A");
let A = _A;

export { A as default };
`);
    });
});
