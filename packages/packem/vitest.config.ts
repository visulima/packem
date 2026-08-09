import { getVitestConfig } from "../../tools/get-vitest-config";

// Snapshots routinely diverge between rollup and rolldown (chunk hashes,
// `var x = ...` vs `const x = ...`, `//#region` markers, hoist order, etc.).
// Suffix snapshot files with the active bundler so each backend owns its own
// frozen baseline and the same test can match either bundler.
const bundlerSnapshotSuffix = process.env.PACKEM_TEST_BUNDLER === "rolldown" ? ".rolldown" : "";

// Guardrail: the `.rolldown` snapshot suffix above lives only in THIS config.
// Running `vitest -u` from the repo root loads the root config (no suffix), so
// rolldown output silently overwrites the CI-checked rollup `.snap` files.
// Refuse to update snapshots unless the bundler is explicit, so an accidental
// bare `vitest -u` fails fast instead of corrupting a baseline.
const isSnapshotUpdate = process.argv.includes("-u") || process.argv.includes("--update");

if (isSnapshotUpdate && !process.env.PACKEM_TEST_BUNDLER) {
    throw new Error(
        "Refusing to update snapshots without PACKEM_TEST_BUNDLER set.\n"
        + "The .rolldown snapshot suffix only applies when vitest runs from inside packages/packem.\n"
        + "Regenerate from packages/packem with one of:\n"
        + "  rollup   (CI-checked .snap):     PACKEM_TEST_BUNDLER=rollup pnpm exec vitest run \"<path>\" -u\n"
        + "  rolldown (.rolldown.snap):       PACKEM_TEST_BUNDLER=rolldown pnpm exec vitest run \"<path>\" -u\n"
        + "Or use the package scripts: pnpm run test:rollup -- -u / pnpm run test:rolldown -- -u\n"
        + "Run `pnpm install --frozen-lockfile` first: snapshots capture minified output, "
        + "so a node_modules that has drifted from the lock file regenerates them against "
        + "the wrong toolchain and CI will disagree.",
    );
}

// https://vitejs.dev/config/
export default getVitestConfig({
    test: {
        resolveSnapshotPath: (testPath, snapExtension) => {
            const dir = testPath.replace(/(\\|\/)([^\\/]+)$/, "$1__snapshots__$1");
            const file = testPath.replace(/^.*(\\|\/)/, "");

            return `${dir}${file}${bundlerSnapshotSuffix}${snapExtension}`;
        },
        testTimeout: 15_000,
    },
});
