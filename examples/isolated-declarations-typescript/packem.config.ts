import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import isolatedDeclarationTransformer from "@visulima/packem/transformer/dts/swc";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    fileCache: false,
    transformer,
    isolatedDeclarationTransformer
});
