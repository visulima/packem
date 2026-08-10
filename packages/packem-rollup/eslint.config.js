import { createConfig } from "@anolilab/eslint-config";

/** @type {import("@anolilab/eslint-config").PromiseFlatConfigComposer} */
export default createConfig(
    {
        css: false,
        ignores: [
            "dist",
            "node_modules",
            "coverage",
            "__fixtures__",
            "__bench__",
            "__docs__",
            "examples",
            "vitest.config.ts",
            "vitest.bench.config.ts",
            "packem.config.ts",
            ".secretlintrc.cjs",
            ".prettierrc.cjs",
            "tsconfig.eslint.json",
            "README.md",
        ],
        jsx: false,
        react: false,
        // Enable this after the lint errors are fixed.
        // typescript: {
        //    tsconfigPath: "tsconfig.json",
        // },
    },
    {
        ignores: ["**/__tests__/**"],
        rules: {
            "unicorn/prefer-module": "off",
        },
    },
    {
        files: ["**/__tests__/**"],
        rules: {
            // vi.fn() generic type params are noise for these simple stubs.
            "vitest/require-mock-type-parameters": "off",
        },
    },
    {
        files: ["__tests__/**"],
        rules: {
            // These simple test suites read clearer as individual cases than parameterized ones.
            "sonarjs/parameterized-tests": "off",
        },
    },
);
