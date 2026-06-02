// This tool is used by the pr ci to determine the packages that need to be published to the pkg-pr-new registry.

// @ts-check
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { env, exit } from "node:process";
import { fileURLToPath } from "node:url";

if (!env.CHANGED_FILES) {
    console.log("No changed files found");

    exit(0);
}

// eslint-disable-next-line @typescript-eslint/naming-convention,no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDirectory = join(__dirname, "..");

// Call the nx binary directly instead of through `pnpm exec`: pnpm prepends a
// workspace banner and a deps-verification/prepare prelude to stdout, which
// corrupts the JSON parsed below. Passing the args as an array also avoids the
// shell, so the `*-bench` glob reaches nx literally instead of being expanded.
const json = execFileSync(
    join(rootDirectory, "node_modules", ".bin", "nx"),
    ["show", "projects", "--affected", "--exclude=*-bench", "--exclude=examples_*", `--files=${env.CHANGED_FILES}`, "--json"],
    { encoding: "utf8" },
);

/** @type {string[]} */
const affectedRepoPackages = JSON.parse(json);

const packagesPath = join(rootDirectory, "packages");

const packages = affectedRepoPackages
    .map((projectName) => join(packagesPath, projectName))
    // Only `packages/*` projects are published to the preview registry. Affected
    // projects that live elsewhere (e.g. `benchmarks/`, nested example packages)
    // can surface here through the dependency graph — skip them instead of
    // failing the job.
    .filter((packageDirectory) => existsSync(join(packageDirectory, "package.json")));

if (packages.length > 0) {
    execFileSync("pnpm", ["exec", "pkg-pr-new", "publish", "--comment=update", "--pnpm", ...packages], { stdio: "inherit" });
} else {
    console.log("No packages to publish");
}
