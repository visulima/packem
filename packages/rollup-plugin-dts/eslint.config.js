import { createConfig } from "@anolilab/eslint-config";

export default createConfig(
    {
        css: false,
        ignores: [
            "dist",
            "node_modules",
            "coverage",
            // Recursive so nested fixture trees (e.g. __tests__/__fixtures__/**) are
            // ignored too — they hold .js/.ts test inputs that aren't in any tsconfig,
            // so typed rules (e.g. vitest/unbound-method) crash trying to type them.
            "**/__fixtures__/**",
            "__fixtures__",
            "__docs__",
            "__tests__/fixtures/**",
            "__tests__/rollup-plugin-dts/**",
            "__tests__/__snapshots__/**",
            "__tests__/temp/**",
            "vitest.config.ts",
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
        ignores: ["**/__tests__"],
        rules: {
            "unicorn/prefer-module": "off",
        },
    },
    {
        // The fixture-driven test files declare cases via testFixtures() from @sxzz/test-utils,
        // which generates `it()` calls dynamically — the sonarjs rule cannot detect them.
        files: ["__tests__/rollup-plugin-dts.test.ts", "__tests__/source-map.test.ts"],
        rules: {
            "sonarjs/no-empty-test-file": "off",
        },
    },
    {
        files: ["__tests__/source-map.test.ts"],
        rules: {
            "vitest/expect-expect": [
                "warn",
                {
                    assertFunctionNames: ["expect", "validateSourceMap"],
                },
            ],
        },
    },
);
