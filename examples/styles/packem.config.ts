import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import postcssLoader from "@visulima/packem/css/loader/postcss";
import sassLoader from "@visulima/packem/css/loader/sass";
import lessLoader from "@visulima/packem/css/loader/less";
import stylusLoader from "@visulima/packem/css/loader/stylus";
import sourcemapLoader from "@visulima/packem/css/loader/sourcemap";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    rollup: {
        css: {
            // mode: "extract",
            loaders: [postcssLoader, sourcemapLoader, sassLoader, lessLoader, stylusLoader],
        },
    },
    declaration: false,
    fileCache: true,
});
