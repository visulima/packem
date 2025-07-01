import { createConfig } from "@anolilab/eslint-config";

/** @type {import("@anolilab/eslint-config").PromiseFlatConfigComposer} */
export default createConfig({
    css: false,
    ignores: ["dist", "node_modules", "coverage", "__fixtures__", "__docs__", "examples", "vitest.config.ts", "packem.config.ts", ".secretlintrc.cjs", "tsconfig.eslint.json", "README.md"],
    // Enable this after the lint errors are fixed.
    // typescript: {
    //    tsconfigPath: "tsconfig.json",
    // },
}, {
    ignores: ["**/__tests__"],
    rules: {
        "unicorn/prefer-module": "off",
    },
}, {
    ignores: ["**/lightningcss.ts", "**/cssnano.ts"],
    rules: {
        "jsdoc/match-description": "off",
        "sonarjs/file-name-differ-from-class": "off",
    },
});
