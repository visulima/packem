import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import stylusLoader from "@visulima/packem/css/loader/stylus";
import lessLoader from "@visulima/packem/css/loader/less";
import sassLoader from "@visulima/packem/css/loader/sass";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";
import cssnanoMinifier from "@visulima/packem/css/minifier/cssnano";

export default defineConfig({
    transformer,
    rollup: {
        css: {
            mode: "inject",
            loaders: [postcssLoader, stylusLoader, lessLoader, sassLoader, sourceMapLoader],
            minifier: cssnanoMinifier,
        },
    },
});
