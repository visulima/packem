// Runs from `vis staged` (see `staged` in vis.config.ts), which appends the staged files:
//   node scripts/staged.mjs typecheck <files…>   tsc --noEmit once per nearest tsconfig.json
//   node scripts/staged.mjs test <files…>        vitest related, once per owning package
//
// A script rather than inline functions in vis.config.ts: vis caches the loaded config as
// JSON and drops function-valued tasks on every run after the first
// (https://github.com/visulima/vis/issues/54), and appends the file list to whatever a function
// returns (https://github.com/visulima/vis/issues/55).

// @ts-check
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { argv, cwd, exit } from "node:process";

const [mode, ...files] = argv.slice(2);

const run = (args, options = {}) => execFileSync("pnpm", args, { stdio: "inherit", ...options });

if (mode === "typecheck") {
    const projects = new Set();

    for (const file of files) {
        for (let directory = dirname(file); ; directory = dirname(directory)) {
            if (existsSync(join(directory, "tsconfig.json"))) {
                projects.add(join(directory, "tsconfig.json"));
                break;
            }

            if (dirname(directory) === directory) {
                break;
            }
        }
    }

    for (const project of projects) {
        run(["exec", "tsc", "--noEmit", "--project", project]);
    }
} else if (mode === "test") {
    // vitest runs from the owning package, not the repo root: some package tests snapshot
    // CWD-relative paths (via @sxzz/test-utils `[CWD]` substitution) that only match with the
    // package as the working directory. The lazy match makes the FIRST `packages/<pkg>` segment
    // win, so a fixture's nested fake package (`__fixtures__/.../packages/packi`) never does.
    const groups = new Map();

    for (const file of files) {
        // Fixture trees hold `.ts`/`.js` inputs to tests, not tests themselves.
        if (/\/__fixtures__\/|\/__tests__\/fixtures\//u.test(file)) {
            continue;
        }

        const packageDirectory = /^(.*?\/packages\/[^/]+)\//u.exec(file)?.[1] ?? cwd();

        groups.set(packageDirectory, [...(groups.get(packageDirectory) ?? []), relative(packageDirectory, file)]);
    }

    for (const [packageDirectory, relativeFiles] of groups) {
        run(["--dir", packageDirectory, "exec", "vitest", "related", "--run", ...relativeFiles]);
    }
} else {
    console.error(`Unknown mode "${mode}". Expected "typecheck" or "test".`);
    exit(1);
}
