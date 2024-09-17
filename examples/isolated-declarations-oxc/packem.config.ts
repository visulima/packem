import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/oxc";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    fileCache: false,
    transformer,
    isolatedDeclarationTransformer,
    rollup: {
        node10Compatibility: {
            writeToPackageJson: true,
        },
    },
});
