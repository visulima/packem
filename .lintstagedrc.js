import path from "node:path";

import { defineConfig } from "@anolilab/lint-staged-config";

const base = defineConfig();

// lint-staged runs from the repo root, so a bare `vitest related --run` resolves
// `process.cwd()` to the monorepo root. Some package tests snapshot CWD-relative
// paths (via @sxzz/test-utils `[CWD]` substitution) and only match when vitest
// runs with the package as its working directory. Group staged test files by
// their owning package and invoke vitest with `pnpm --dir <pkg>` so the snapshot
// normalization is stable regardless of where the commit happens.
const groupByPackage = (files) => {
    const groups = new Map();

    for (const file of files) {
        const match = file.match(/^(.*\/packages\/[^/]+)\//);
        const packageDirectory = match ? match[1] : process.cwd();

        if (!groups.has(packageDirectory)) {
            groups.set(packageDirectory, []);
        }

        groups.get(packageDirectory).push(path.relative(packageDirectory, file));
    }

    return groups;
};

const testCommand = (files) =>
    [...groupByPackage(files)].map(
        ([packageDirectory, relativeFiles]) =>
            `pnpm --dir ${JSON.stringify(packageDirectory)} exec vitest related --run ${relativeFiles
                .map((relativeFile) => JSON.stringify(relativeFile))
                .join(" ")}`,
    );

export default {
    ...base,
    "**/?(*.){test,spec}.?(c|m)[jt]s?(x)": testCommand,
    "**/__tests__/**/*.?(c|m)[jt]s?(x)": testCommand,
};
