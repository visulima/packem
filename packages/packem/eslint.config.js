import { createConfig } from "@anolilab/eslint-config";

export default createConfig({
    ignores: ["**/__fixtures__"],
    jsx: false,
    react: false,
}, {
    ignores: ["**/__tests__"],
    rules: {
        "unicorn/prefer-module": "off",
    },
});
