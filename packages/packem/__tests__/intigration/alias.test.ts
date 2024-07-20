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

export default log();`,
        );
        writeFileSync(`${temporaryDirectoryPath}/src/test/logger.ts`, `export const log = () => console.log("test");`);
        createPackageJson(temporaryDirectoryPath, {
            main: "./dist/index.cjs",
            type: "commonjs",
        });
        createTsConfig(temporaryDirectoryPath, { compilerOptions: { rootDir: "./src" } });
        await createPackemConfig(temporaryDirectoryPath, {
            alias: {
                "@/test/*": resolve(temporaryDirectoryPath, "src/test"),
            },
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: temporaryDirectoryPath,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${temporaryDirectoryPath}/dist/importer.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs content");

        const cjsContent = readFileSync(`${temporaryDirectoryPath}/dist/importer.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs content");
    });
});
