import { createConfig } from "@anolilab/eslint-config";

// eslint-disable-next-line import/no-relative-packages -- the shared lint rules live in the workspace root, they are not a package import
import houseRules from "../../tools/eslint-house-rules.js";

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
            ".secretlintrc.cjs",
            ".prettierrc.cjs",
            "tsconfig.eslint.json",
            "README.md",
        ],
        jsx: false,
        react: false,
        // prettier owns formatting in this repo. Leaving the stylistic rules on means
        // eslint --fix and prettier --write rewrite each other's output forever.
        stylistic: false,
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
        ignores: ["**/src/cli/commands/**"],
        rules: {
            "sonarjs/file-name-differ-from-class": "off",
        },
    },
    {
        // tsconfig*.json are JSONC by design (TypeScript natively supports
        // comments here). The rationale comments documenting non-obvious
        // compiler-option choices are intentional and worth keeping.
        files: ["**/tsconfig.json", "**/tsconfig.*.json"],
        rules: {
            "jsonc/no-comments": "off",
        },
    },
    {
        // Integration tests construct package.json fixtures as inline object
        // literals. Conditional `exports` resolution is order-sensitive: Node/TS
        // pick the first matching condition by key order, so `types` must precede
        // `default`. perfectionist/sort-objects would alphabetize these and
        // silently break type resolution (default < types) — same rationale the
        // base preset uses to disable jsonc/sort-keys for real package.json files.
        files: ["**/__tests__/**"],
        rules: {
            "perfectionist/sort-objects": "off",
        },
    },
    {
        // packem is a bundler that inlines most of its `@visulima/*` and `semver`
        // helpers into `dist` (everything not listed in `externals` of
        // packem.config.ts is bundled), so they live in devDependencies by design.
        // Importing them from `src` is intentional — promoting them to runtime
        // `dependencies` would force consumers to install code that is already
        // bundled, so allow devDependency imports here instead.
        files: ["**/src/**"],
        rules: {
            "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
        },
    },
    houseRules,
);
