import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/oxc";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    rollup: {
        node10Compatibility: {
            writeToPackageJson: true,
        },
    },
});
