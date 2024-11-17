import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/typescript";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    fileCache: false,
    transformer,
    isolatedDeclarationTransformer,
    rollup: {
        node10Compatibility: {
            typeScriptVersion: ">=5.5",
            writeToPackageJson: true,
        },
    },
});
