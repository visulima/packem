import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

import { writeFileSync } from "@visulima/fs";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPackageJson, execPackemSync, getNodePathList, streamToString } from "../helpers";

describe("packem copy", () => {
    let distribution: string;

    beforeEach(async () => {
        distribution = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(distribution, { recursive: true });
    });

    it("should not trigger a warning if alias option is used", async () => {
        expect.assertions(4);

        writeFileSync(`${distribution}/src/index.ts`, `console.log("Hello, world!");`);
        writeFileSync(`${distribution}/assets/style.css`, `body { background-color: red; }`);
        writeFileSync(`${distribution}/assets/data.csv`, `name,age`);
        createPackageJson(distribution, {
            main: "./dist/index.cjs",
            packem: {
                rollup: {
                    copy: {
                        targets: "assets/*",
                    },
                },
            },
            type: "commonjs",
        });

        const binProcess = execPackemSync("build", ["--env NODE_ENV=development"], {
            cwd: distribution,
        });

        await expect(streamToString(binProcess.stderr)).resolves.toBe("");
        expect(binProcess.exitCode).toBe(0);

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(`${distribution}/dist/style.css`)).toBeTruthy();
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        expect(existsSync(`${distribution}/dist/data.csv`)).toBeTruthy();
    });
});
