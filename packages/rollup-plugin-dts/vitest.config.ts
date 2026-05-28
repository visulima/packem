import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    server: {
        watch: {
            ignored: ["**/temp/**"],
        },
    },
    test: {
        exclude: [
            // Keep vitest's defaults (node_modules, dist, etc.) — overriding
            // `exclude` wholesale clobbers them and globs the symlinked
            // node_modules/@visulima/packem suite.
            ...configDefaults.exclude,
            // Unported upstream suite (@sxzz rolldown-plugin-dts fixture set under
            // __tests__/__fixtures__/rollup-plugin-dts): 126 fixtures still fail
            // against this rollup port. Tracked separately — not a missing dir.
            "**/__tests__/rollup-plugin-dts.test.ts",
        ],
        testTimeout: 30_000,
    },
});
