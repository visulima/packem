import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/swc";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "browser",
    transformer,
    rollup: {
        node10Compatibility: {
            writeToPackageJson: true,
        },
    },
});
