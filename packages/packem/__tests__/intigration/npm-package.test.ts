import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem npm package", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should bundle deeks package", async () => {
        expect.assertions(5);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `export type { DeeksOptions as DeepKeysOptions } from "deeks";
export { deepKeys, deepKeysFromList } from "deeks";`,
        );

        await createTsConfig(temporaryDirectoryPath, {
            compilerOptions: { target: "es2018" },
        });
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                deeks: "*",
                typescript: "*",
            },
            module: "dist/index.cjs",
            // type: "module",
            types: "dist/index.d.ts",
        });
        await createPackemConfig(temporaryDirectoryPath);
        await installPackage(temporaryDirectoryPath, "typescript");
        await installPackage(temporaryDirectoryPath, "deeks");

        const binProcessEs2018 = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcessEs2018.stderr).toBe("");
        expect(binProcessEs2018.exitCode).toBe(0);

        const dMtsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.mts`);

        expect(dMtsContentEs2018).toBe(`interface DeeksOptions {
    /** @default false */
    arrayIndexesAsKeys?: boolean;
    /** @default true */
    expandNestedObjects?: boolean;
    /** @default false */
    expandArrayObjects?: boolean;
    /** @default false */
    ignoreEmptyArraysWhenExpanding?: boolean;
    /** @default false */
    escapeNestedDots?: boolean;
    /** @default false */
    ignoreEmptyArrays?: boolean;
}

/**
 * Return the deep keys list for a single document
 * @param object
 * @param options
 * @returns {Array}
 */
declare function deepKeys(object: object, options?: DeeksOptions): string[];
/**
 * Return the deep keys list for all documents in the provided list
 * @param list
 * @param options
 * @returns Array[Array[String]]
 */
declare function deepKeysFromList(list: object[], options?: DeeksOptions): string[][];

export { type DeeksOptions as DeepKeysOptions, deepKeys, deepKeysFromList };
`);

        const dTsContentEs2018 = readFileSync(`${temporaryDirectoryPath}/dist/index.d.ts`);

        expect(dTsContentEs2018).toBe(`interface DeeksOptions {
    /** @default false */
    arrayIndexesAsKeys?: boolean;
    /** @default true */
    expandNestedObjects?: boolean;
    /** @default false */
    expandArrayObjects?: boolean;
    /** @default false */
    ignoreEmptyArraysWhenExpanding?: boolean;
    /** @default false */
    escapeNestedDots?: boolean;
    /** @default false */
    ignoreEmptyArrays?: boolean;
}

/**
 * Return the deep keys list for a single document
 * @param object
 * @param options
 * @returns {Array}
 */
declare function deepKeys(object: object, options?: DeeksOptions): string[];
/**
 * Return the deep keys list for all documents in the provided list
 * @param list
 * @param options
 * @returns Array[Array[String]]
 */
declare function deepKeysFromList(list: object[], options?: DeeksOptions): string[][];

export { type DeeksOptions as DeepKeysOptions, deepKeys, deepKeysFromList };
`);

        const ctsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(ctsContent).toBe(`var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
const _A = class _A {
};
__name(_A, "A");
let A = _A;

export { A as default };
`);
    });
});
