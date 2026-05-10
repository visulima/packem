import { getVitestConfig } from "../../tools/get-vitest-config";

// Snapshots routinely diverge between rollup and rolldown (chunk hashes,
// `var x = ...` vs `const x = ...`, `//#region` markers, hoist order, etc.).
// Suffix snapshot files with the active bundler so each backend owns its own
// frozen baseline and the same test can match either bundler.
const bundlerSnapshotSuffix
    = process.env.PACKEM_TEST_BUNDLER === "rolldown" ? ".rolldown" : "";

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
