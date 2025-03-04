import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { afterEach, describe, expect, it } from "vitest";

import { createPackemConfig, execPackemSync } from "../helpers";

const ecosystemPath = join(__dirname, "../..", "__fixtures__", "ecosystem");

const ecosystemSuites = readdirSync(ecosystemPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

describe("packem ecosystem", () => {
    afterEach(async () => {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        for await (const suite of ecosystemSuites) {
            await rm(join(ecosystemPath, suite, "dist"), { force: true, recursive: true });
        }
    });

    it.each(ecosystemSuites)("should work with provided '%s' ecosystem suite", async (suite) => {
        const fullSuitePath = join(ecosystemPath, suite);

        await createPackemConfig(fullSuitePath, {
            isolatedDeclarationTransformer: "typescript",
            transformer: "esbuild",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: fullSuitePath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const distributionFiles = readdirSync(join(fullSuitePath, "dist"), {
            recursive: true,
            withFileTypes: true,
        })
            .filter((dirent) => dirent.isFile())
            .map((dirent) => readFileSync(join(dirent.parentPath, dirent.name)));

        expect(distributionFiles).toMatchSnapshot();
    });

    it.todo.each(ecosystemSuites)("should work with provided '%s' ecosystem suite and oxc resolver", async (suite) => {
        const fullSuitePath = join(ecosystemPath, suite);

        await createPackemConfig(fullSuitePath, {
            experimental: {
                oxcResolve: true,
            },
            isolatedDeclarationTransformer: "typescript",
            transformer: "esbuild",
        });

        const binProcess = await execPackemSync("build", [], {
            cwd: fullSuitePath,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const distributionFiles = readdirSync(join(fullSuitePath, "dist"), {
            recursive: true,
            withFileTypes: true,
        })
            .filter((dirent) => dirent.isFile())
            .map((dirent) => readFileSync(join(dirent.parentPath, dirent.name)));

        expect(distributionFiles).toMatchSnapshot();
    });
});
