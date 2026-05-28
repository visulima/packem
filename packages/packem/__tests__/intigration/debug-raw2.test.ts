import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers/index";
import temporaryDirectory from "../helpers/temporary-directory";

describe("debug-raw2", () => {
    it("second build stderr with ?raw", async () => {
        expect.assertions(4);

        const temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);

        writeFileSync(`${temporaryDirectoryPath}/src/content.txt`, `first-version`);
        writeFileSync(`${temporaryDirectoryPath}/src/index.ts`, `import content from './content.txt?raw';\n\nexport const data = content;`);

        await installPackage(temporaryDirectoryPath, "typescript");
        await createTsConfig(temporaryDirectoryPath);
        await createPackageJson(temporaryDirectoryPath, { devDependencies: { typescript: "*" }, main: "./dist/index.cjs", module: "./dist/index.mjs" });

        const r1 = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(r1.exitCode).toBe(0);
        expect(r1.stderr).toBe("");

        writeFileSync(`${temporaryDirectoryPath}/src/content.txt`, `second-version`);

        const r2 = await execPackem("build", [], { cwd: temporaryDirectoryPath, reject: false });

        expect(r2.exitCode).toBe(0);
        expect(r2.stderr).toBe("");

        await rm(temporaryDirectoryPath, { recursive: true });
    }, 60_000);
});
