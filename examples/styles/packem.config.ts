import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import lessLoader from "@visulima/packem/css/loader/less";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import sassLoader from "@visulima/packem/css/loader/sass";
import stylusLoader from "@visulima/packem/css/loader/stylus";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";

export default defineConfig({
    transformer,
    rollup: {
        css: {
            mode: "extract",
            loaders: [lessLoader, postcssLoader, sassLoader, stylusLoader, sourceMapLoader],
        },
    },
    declaration: false,
});
