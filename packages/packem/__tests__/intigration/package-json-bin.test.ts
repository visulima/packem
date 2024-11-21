import { rm } from "node:fs/promises";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, installPackage } from "../helpers";

describe("packem package.json bin", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();

        await createPackemConfig(temporaryDirectoryPath);
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should work with bin as .cts extension", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/bin/index.cts`,
            `#!/usr/bin/env node
const path = require("path");
console.log(path.basename(__filename));
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            bin: "./dist/bin/index.cjs",
            devDependencies: {
                typescript: "*",
            },
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });

    it("should work with bin as .mts extension", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/bin/index.mts`,
            `#!/usr/bin/env node
console.log("Hello, world!");
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            bin: "./dist/bin/index.mjs",
            devDependencies: {
                typescript: "*",
            },
            type: "module",
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs output");
    });

    it("should work with bin as multi path", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/bin/a.ts`,
            `#!/usr/bin/env node
console.log("a");
`,
        );
        writeFileSync(
            `${temporaryDirectoryPath}/src/bin/b.ts`,
            `#!/usr/bin/env node
console.log("b");
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            bin: {
                a: "./dist/bin/a.cjs",
                b: "./dist/bin/b.cjs",
            },
            devDependencies: {
                typescript: "*",
            },
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsAContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/a.cjs`);

        expect(cjsAContent).toMatchSnapshot("cjs output");

        const cjsBContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/b.cjs`);

        expect(cjsBContent).toMatchSnapshot("cjs output");
    });

    it("should patch binary directive", async () => {
        expect.assertions(3);

        writeFileSync(
            `${temporaryDirectoryPath}/src/bin/index.ts`,
            `console.log("Hello, world!");
`,
        );

        await installPackage(temporaryDirectoryPath, "typescript");

        await createPackageJson(temporaryDirectoryPath, {
            bin: "./dist/bin/index.cjs",
            devDependencies: {
                typescript: "*",
            },
        });
        await createTsConfig(temporaryDirectoryPath);

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/bin/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs output");
    });
});
