import { access, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { rollupBuild as rolldownBuild, rollupBuild, testFixtures } from "@sxzz/test-utils";
import { createPatch } from "diff";
import { dts as rollupDts } from "rollup-plugin-dts";
import { glob } from "tinyglobby";
import { expect } from "vitest";

import { dts } from "../src/index.js";

const REGION_COMMENT_RE = /\/\/#region .*\n/g;
const FROM_DOUBLE_QUOTE_RE = /from "(.*)"/g;
const TRAILING_SEMICOLON_RE = /;$/gm;

const isUpdateEnabled = process.env.npm_lifecycle_script?.includes("-u") ?? process.env.npm_lifecycle_script?.includes("--update") ?? false;

const cleanupCode = (text: string): string =>
    `${text
        .replaceAll(REGION_COMMENT_RE, "")
        .replaceAll("//#endregion", "")
        .replaceAll(FROM_DOUBLE_QUOTE_RE, "from '$1'")
        // Normalize: the legacy rollup-plugin-dts emits `export type` while the new plugin emits `export`
        .replaceAll("export type", "export")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .join("\n")
        .replaceAll(TRAILING_SEMICOLON_RE, "")
        .trim()}\n`;

const buildSnapshots = async (entries: string[]): Promise<[string, string]> => {
    const [rolldownSnap, rollupSnap] = await Promise.all([
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
    ]);

    return [rolldownSnap, rollupSnap];
};

const stringifyError = (error: unknown): string => {
    if (error instanceof Error)
        return error.message;

    if (typeof error === "string")
        return error;

    try {
        return JSON.stringify(error);
    } catch {
        return "Unknown error";
    }
};

const handleDiff = async (diff: string, diffPath: string, knownDiffPath: string): Promise<void> => {
    // not the same
    if (diff.split("\n").length !== 5) {
        const knownDiff = await readFile(knownDiffPath, "utf8").catch(() => undefined);

        if (knownDiff === diff) {
            await unlink(diffPath).catch(() => {});
        } else {
            await expect(diff).toMatchFileSnapshot(knownDiff ? knownDiffPath : diffPath);

            await unlink(knownDiff ? diffPath : knownDiffPath).catch(() => {});
        }

        return;
    }

    if (isUpdateEnabled) {
        await Promise.all([unlink(diffPath).catch(() => {}), unlink(knownDiffPath).catch(() => {})]);

        return;
    }

    // eslint-disable-next-line vitest/require-to-throw-message -- the throw is the assertion itself, no message needed
    await expect(access(diffPath)).rejects.toThrow();
    // eslint-disable-next-line vitest/require-to-throw-message -- the throw is the assertion itself, no message needed
    await expect(access(knownDiffPath)).rejects.toThrow();
};

await testFixtures(
    "__tests__/__fixtures__/rollup-plugin-dts/**/{index,main-a}.d.ts",
    async (_arguments, id) => {
        const dirname = path.dirname(id);

        let entries = [id];

        if (id.endsWith("main-a.d.ts")) {
            entries = await glob("main-*.d.ts", { absolute: true, cwd: dirname });
        }

        let caughtError: unknown;
        let rolldownSnapshot = "";
        let rollupSnapshot = "";

        try {
            [rolldownSnapshot, rollupSnapshot] = await buildSnapshots(entries);
        } catch (error: unknown) {
            caughtError = error;
        }

        if (id.includes("error")) {
            // eslint-disable-next-line vitest/no-standalone-expect -- testFixtures invokes this callback inside a test context
            expect(caughtError).toBe(true);

            return;
        }

        if (caughtError) {
            throw caughtError instanceof Error ? caughtError : new Error(stringifyError(caughtError));
        }

        // eslint-disable-next-line vitest/no-standalone-expect -- testFixtures invokes this callback inside a test context
        await expect(rolldownSnapshot).toMatchFileSnapshot(path.resolve(dirname, "snapshot.d.ts"));

        rollupSnapshot = cleanupCode(rollupSnapshot);
        rolldownSnapshot = cleanupCode(rolldownSnapshot);

        const diffPath = path.resolve(dirname, "diff.patch");
        const knownDiffPath = path.resolve(dirname, "known-diff.patch");
        const diff = createPatch("diff.patch", rollupSnapshot, rolldownSnapshot, undefined, undefined, {
            ignoreWhitespace: true,
            stripTrailingCr: true,
        });

        await handleDiff(diff, diffPath, knownDiffPath);
    },
    { snapshot: false },
);
