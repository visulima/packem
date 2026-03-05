import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { describe, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackem, installPackage } from "../helpers/index";

describe("debug-raw2", () => {
    it("second build stderr with ?raw", async () => {
        const tmpDir = temporaryDirectory();

        await createPackemConfig(tmpDir);

        writeFileSync(`${tmpDir}/src/content.txt`, `first-version`);
        writeFileSync(`${tmpDir}/src/index.ts`, `import content from './content.txt?raw';\n\nexport const data = content;`);

        await installPackage(tmpDir, "typescript");
        await createTsConfig(tmpDir);
        await createPackageJson(tmpDir, { devDependencies: { typescript: "*" }, main: "./dist/index.cjs", module: "./dist/index.mjs" });

        const r1 = await execPackem("build", [], { cwd: tmpDir, reject: false });

        console.log("FIRST exitCode:", r1.exitCode);
        console.log("FIRST stderr:", r1.stderr.slice(0, 2000));

        writeFileSync(`${tmpDir}/src/content.txt`, `second-version`);

        const r2 = await execPackem("build", [], { cwd: tmpDir, reject: false });

        console.log("SECOND exitCode:", r2.exitCode);
        console.log("SECOND stderr:", r2.stderr.slice(0, 2000));
        console.log("SECOND stdout:", r2.stdout?.slice(-3000));

        await rm(tmpDir, { recursive: true });
    }, 60_000);
});
