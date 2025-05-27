import { createConfig } from "@anolilab/eslint-config";

export default createConfig({
    ignores: ["**/__fixtures__"],
    jsx: false,
    react: false,
});
