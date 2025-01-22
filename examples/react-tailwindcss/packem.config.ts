import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import cssnano from "@visulima/packem/css/minifier/cssnano";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "browser",
    transformer,
    rollup: {
        css: {
            mode: "extract",
            loaders: [postcssLoader],
            minifier: cssnano()
        },
    },
    declaration: "node16"
});
