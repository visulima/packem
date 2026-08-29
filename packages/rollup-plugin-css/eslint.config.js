import { createConfig } from "@anolilab/eslint-config";

// eslint-disable-next-line import/no-relative-packages -- the shared lint rules live in the workspace root, they are not a package import
import houseRules from "../../tools/eslint-house-rules.js";

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
            "packem.config.ts",
            ".secretlintrc.cjs",
            ".prettierrc.cjs",
            "tsconfig.eslint.json",
            "README.md",
        ],
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
        ignores: ["**/lightningcss.ts", "**/cssnano.ts"],
        rules: {
            "jsdoc/match-description": "off",
            "sonarjs/file-name-differ-from-class": "off",
        },
    },
    houseRules,
);
