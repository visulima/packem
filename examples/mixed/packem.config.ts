import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    transformer,
    rollup: {
        node10Compatibility: {
            writeToPackageJson: true,
        },
    },
});
