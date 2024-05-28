import { readdir, rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createTsConfig, execPackemSync, streamToString } from "../helpers";
import * as console from "node:console";
import { join } from "@visulima/path";

describe("packem typescript", () => {
    let distribution: string;

    beforeEach(async () => {
        distribution = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(distribution, { recursive: true });
    });

    it("should support of tsconfig overwrite", async () => {
        expect.assertions(5);

        writeFileSync(`${distribution}/src/index.ts`, `export default class A {}`);
        createTsConfig(
            distribution,
            {
                compilerOptions: { target: "es2018" },
            },
            ".build",
        );
        createPackageJson(distribution, {
            exports: {
                ".": {
                    default: "./dist/index.mjs",
                    types: "./dist/index.d.ts",
                },
            },
            type: "module",
        });

        const binProcessEs2018 = execPackemSync("build", ["--tsconfig=tsconfig.build.json"], {
            cwd: distribution,
        });

        await expect(streamToString(binProcessEs2018.stderr)).resolves.toBe("");
        // expect(binProcessEs2018.exitCode).toBe(0);

        const dMtsContentEs2018 = readFileSync(`${distribution}/dist/index.d.mts`);

        expect(dMtsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const dTsContentEs2018 = readFileSync(`${distribution}/dist/index.d.ts`);

        expect(dTsContentEs2018).toBe(`declare class A {
}

export { A as default };
`);

        const dCtsContentEs2018 = readFileSync(`${distribution}/dist/index.mjs`);

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
