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
        // Lazy match so the FIRST `packages/<pkg>` segment wins. A greedy `.*`
        // would pick the innermost one — e.g. a fixture's nested fake package
        // (`__fixtures__/.../packages/packi`) — and `pnpm --dir` would fail with
        // ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE since it is not a workspace member.
        const match = file.match(/^(.*?\/packages\/[^/]+)\//);
        const packageDirectory = match ? match[1] : process.cwd();

        if (!groups.has(packageDirectory)) {
            groups.set(packageDirectory, []);
        }

        groups.get(packageDirectory).push(path.relative(packageDirectory, file));
    }

    return groups;
};

// Fixture trees hold `.ts`/`.js` data files (and fake nested package.json /
// tsconfig setups) that are inputs to tests, not tests themselves. Running
// `vitest related` on them is meaningless and trips on the fake packages.
const isFixtureFile = (file) => /\/__fixtures__\/|\/__tests__\/fixtures\//.test(file);

const testCommand = (files) =>
    [...groupByPackage(files.filter((file) => !isFixtureFile(file)))].map(
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
