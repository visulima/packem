import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, streamToString } from "../helpers";

describe("packem alias", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    it("should not trigger a warning if alias option is used", async () => {
        expect.assertions(4);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { log } from "@/test/logger";
import { bar } from "@test2/abc/bar";

const a = bar();

export default log();`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/test/logger.ts`, `export const log = () => console.log("test");`);
        writeFileSync(`${temporaryDirectoryPath}/src/test2/foo/bar.ts`, `export const bar = () => console.log("bar");`);
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
        });
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            alias: {
                "@": resolve(temporaryDirectoryPath, "src"),
                "@test2/abc": resolve(temporaryDirectoryPath, "src", "test2", "foo"),
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs content");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/index.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs content");
    });

    it.each(["@", "#", "~"])("should trigger a error if a invalid alias (%s) was used", async (alias) => {
        expect.assertions(2);

        writeFileSync(
            `${temporaryDirectoryPath}/src/index.ts`,
            `import { log } from "${alias}/test/logger";

export default log();`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/test/logger.ts`, `export const log = () => console.log("test");`);
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            module: "./dist/index.mjs",
            type: "commonjs",
        });
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            alias: {
                [alias + "/"]: resolve(temporaryDirectoryPath, "src")
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
            // This is needed to get the error
            reject: false,
        });

        expect(binProcess.exitCode).toBe(1);
        await expect(streamToString(binProcess.stderr)).resolves.toContain(`Error: Alias name "${alias}/" is invalid. Alias names should start with a letter or underscore and only contain letters, numbers, underscores, and dashes.`);
    });
});
