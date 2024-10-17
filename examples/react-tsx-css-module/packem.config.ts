import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import postcssLoader from "@visulima/packem/css/loader/postcss";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    rollup: {
        css: {
            mode: "extract",
            loaders: [postcssLoader],
        },
    },
    declaration: true,
    fileCache: true,
});
