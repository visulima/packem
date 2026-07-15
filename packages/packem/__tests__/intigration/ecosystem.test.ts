import { readdirSync } from "node:fs";
import { rm } from "node:fs/promises";

import { readFileSync } from "@visulima/fs";
import { join } from "@visulima/path";
import { afterEach, describe, expect, it } from "vitest";

import { createPackemConfig, execPackem } from "../helpers";

const ecosystemPath = join(__dirname, "../..", "__fixtures__", "ecosystem");

const ecosystemSuites = readdirSync(ecosystemPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

const ecosystemConfigs: Record<string, unknown> = {
    "advanced-tailwind": {
        config: { declaration: false },
        cssLoader: ["tailwindcss"] as "tailwindcss"[],
        runtime: "browser" as const,
        transformer: "esbuild" as const,
    },
    sitefetch: {},
};

describe("packem ecosystem", () => {
    afterEach(async () => {
        await Promise.all(
            ecosystemSuites.map((suite) =>
                rm(join(ecosystemPath, suite, "dist"), {
                    force: true,
                    recursive: true,
                }),
            ),
        );
    });

    it.each(ecosystemSuites)("should work with provided '%s' ecosystem suite", async (suite) => {
        expect.assertions(3);

        const fullSuitePath = join(ecosystemPath, suite);

        await createPackemConfig(fullSuitePath, {
            transformer: "esbuild",
            ...(ecosystemConfigs[suite] as Record<string, unknown>),
        });

        const binProcess = await execPackem("build", [], {
            cwd: fullSuitePath,
        });

        // Ecosystem app fixtures import framework packages (e.g. react) that they intentionally
        // do not declare, so packem advises it will bundle those undeclared deps. Their real-world
        // tsconfigs also set `verbatimModuleSyntax`, which the rolldown backend reports as
        // overridden by packem's `onlyRemoveTypeImports`. Both advisories are expected here; assert
        // no OTHER warnings reached stderr.
        const unexpectedStderr = (binProcess.stderr as string)
            .split("\n")
            .filter(
                (line) =>
                    line.includes("WARNING")
                    && !/but not declared in package\.json|ould not (?:be )?resolve|CONFIGURATION_FIELD_CONFLICT/.test(line),
            );

        expect(unexpectedStderr).toStrictEqual([]);
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
