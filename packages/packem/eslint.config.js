import { createConfig } from "@anolilab/eslint-config";

export default createConfig({
    ignores: ["**/__fixtures__"],
    jsx: false,
    react: false,
    // Enable this after the lint errors are fixed.
    // typescript: {
    //    tsconfigPath: "tsconfig.json",
    // },
}, {
    ignores: ["**/__tests__"],
    rules: {
        "unicorn/prefer-module": "off",
    },
});
