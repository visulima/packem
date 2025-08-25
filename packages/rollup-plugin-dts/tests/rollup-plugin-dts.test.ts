import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { rolldownBuild, rollupBuild, testFixtures } from "@sxzz/test-utils";
import { createPatch } from "diff";
import { dts as rollupDts } from "rollup-plugin-dts";
import { glob } from "tinyglobby";
import { expect } from "vitest";

import { dts } from "../src/index.js";

const isUpdateEnabled
  = process.env.npm_lifecycle_script?.includes("-u")
      || process.env.npm_lifecycle_script?.includes("--update");

await testFixtures(
    "tests/rollup-plugin-dts/**/{index,main-a}.d.ts",
    async (arguments_, id) => {
        const dirname = path.dirname(id);

        let entries = [id];

        if (id.endsWith("main-a.d.ts")) {
            entries = await glob("main-*.d.ts", { absolute: true, cwd: dirname });
        }

        let error: any;
        let [rolldownSnapshot, rollupSnapshot] = await Promise.all([
            rolldownBuild(
                entries,
                [
                    dts({
                        dtsInput: true,
                        sourcemap: false,
                        tsconfig: false,
                    }),
                ],
                {
                    external: ["typescript"],
                    treeshake: true,
                },
            ).then(({ snapshot }) => snapshot),
            rollupBuild(entries, [rollupDts()], undefined, {
                entryFileNames: "[name].ts",
            }).then(({ snapshot }) => snapshot),
        ]).catch((_error) => (error = _error, []));

        if (id.includes("error")) {
            return expect(error).toBe(true);
        }

        if (error) { throw error; }

        await expect(rolldownSnapshot).toMatchFileSnapshot(
            path.resolve(dirname, "snapshot.d.ts"),
        );

        rollupSnapshot = cleanupCode(rollupSnapshot);
        rolldownSnapshot = cleanupCode(rolldownSnapshot);
        const diffPath = path.resolve(dirname, "diff.patch");
        const knownDiffPath = path.resolve(dirname, "known-diff.patch");
        const diff = createPatch(
            "diff.patch",
            rollupSnapshot,
            rolldownSnapshot,
            undefined,
            undefined,
            {
                ignoreWhitespace: true,
                stripTrailingCr: true,
            },
        );

        // not the same
        if (diff.split("\n").length !== 5) {
            const knownDiff = await readFile(knownDiffPath, "utf8").catch(() => null);

            if (knownDiff === diff) {
                await unlink(diffPath).catch(() => {});
            } else {
                await expect(diff).toMatchFileSnapshot(
                    knownDiff ? knownDiffPath : diffPath,
                );

                await unlink(knownDiff ? diffPath : knownDiffPath).catch(() => {});
            }
        } else if (isUpdateEnabled) {
            await Promise.all([
                unlink(diffPath).catch(() => {}),
                unlink(knownDiffPath).catch(() => {}),
            ]);
        } else {
            await expect(access(diffPath)).rejects.toThrow();
            await expect(access(knownDiffPath)).rejects.toThrow();
        }
    },
    { snapshot: false },
);

function cleanupCode(text: string) {
    return `${text
        .replaceAll(/\/\/#region .*\n/g, "")
        .replaceAll("//#endregion", "")
        .replaceAll(/from "(.*)"/g, "from '$1'")
        .replaceAll("export type", "export") // FIXME
        .split("\n")
        .filter((line) => line.trim() !== "")
        .join("\n")
        .replaceAll(/;$/gm, "")
        .trim()}\n`;
}
