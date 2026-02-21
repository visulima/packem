import { defineConfig } from "vitest/config";

export default defineConfig({
    server: {
        watch: {
            ignored: ["**/temp/**"],
        },
    },
    test: {
        exclude: [
            // Requires tests/rollup-plugin-dts/ fixture directory (not yet created)
            "**/__tests__/rollup-plugin-dts.test.ts",
        ],
        testTimeout: 30_000,
    },
});
