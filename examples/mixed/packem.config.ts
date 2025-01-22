import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    runtime: "browser",
    transformer,
    rollup: {
        node10Compatibility: {
            writeToPackageJson: true,
        },
    },
});
