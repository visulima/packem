import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { writeFile } from "@visulima/fs";
import { join } from "@visulima/path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers";

// Regression for the CJS DTS-exports fixer crashing on a multi-entry CommonJS
// package whose bundled `.d.cts` star re-exports its sibling entries. mlly's
// `findExports` returns `names: undefined` for `export * from "..."`, which used to
// crash `extractExports` with
// `TypeError: Cannot read properties of undefined (reading 'includes')`.
// Only CJS-main packages run this fixer, so only they hit it.
describe("packem fix-dts cjs multi-entry", () => {
    let temporaryDirectoryPath: string;

    beforeEach(() => {
        temporaryDirectoryPath = mkdtempSync(join(tmpdir(), "packem-fix-dts-cjs-multi-entry"));
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("builds a multi-entry CJS package that star re-exports its siblings without crashing", async () => {
        expect.assertions(2);

        await installPackage(temporaryDirectoryPath, "typescript");

        // `index` re-exports the sibling entries (which are themselves exports), so the
        // bundled `index.d.cts` carries `export * from "./..."` star re-exports.
        await writeFile(`${temporaryDirectoryPath}/src/index.ts`, `export * from "./types";\nexport * from "./drizzle";\nexport const version = "1.0.0";\n`);
        await writeFile(
            `${temporaryDirectoryPath}/src/types.ts`,
            `export interface Config {\n    name: string;\n}\nexport const defaultConfig: Config = { name: "default" };\n`,
        );
        await writeFile(
            `${temporaryDirectoryPath}/src/drizzle.ts`,
            `export interface Schema {\n    id: number;\n}\nexport const schema: Schema = { id: 1 };\n`,
        );

        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, {
            devDependencies: {
                typescript: "*",
            },
            exports: {
                ".": {
                    types: "./dist/index.d.cts",
                    require: "./dist/index.cjs",
                },
                "./types": {
                    types: "./dist/types.d.cts",
                    require: "./dist/types.cjs",
                },
                "./drizzle": {
                    types: "./dist/drizzle.d.cts",
                    require: "./dist/drizzle.cjs",
                },
            },
            main: "./dist/index.cjs",
            type: "commonjs",
        });
        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).not.toContain("Cannot read properties of undefined");
        expect(binProcess.exitCode).toBe(0);
    });
});
