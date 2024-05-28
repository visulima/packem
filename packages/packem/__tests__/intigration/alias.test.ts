import { rm } from "node:fs/promises";
import { resolve } from "node:path";

import { readFileSync, writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, createPackemConfig, createTsConfig, execPackemSync, streamToString } from "../helpers";

describe("packem alias", () => {
    let distribution: string;

    beforeEach(async () => {
        distribution = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(distribution, { recursive: true });
    });

    it("should not trigger a warning if alias option is used", async () => {
        expect.assertions(4);

        writeFileSync(
            `${distribution}/src/index.ts`,
            `import { log } from "@/test/logger";

export default log();`,
        );
        writeFileSync(`${distribution}/src/test/logger.ts`, `export const log = () => console.log("test");`);
        createPackageJson(distribution, {
            main: "./dist/index.cjs",
            type: "commonjs",
        });
        createTsConfig(distribution, { compilerOptions: { rootDir: "./src" } });
        createPackemConfig(distribution, {
            alias: {
                "@/test/*": resolve(distribution, "src/test"),
            },
        });

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: distribution,
        });

        await expect(streamToString(binProcess.stdout)).resolves.toBe("");
        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(`${distribution}/dist/importer.mjs`);

        expect(mjsContent).toMatchSnapshot("mjs content");

        const cjsContent = readFileSync(`${distribution}/dist/importer.cjs`);

        expect(cjsContent).toMatchSnapshot("cjs content");
    });
});
