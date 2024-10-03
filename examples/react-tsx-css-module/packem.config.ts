import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import lightningcssLoader from "@visulima/packem/css/loader/lightningcss";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    rollup: {
        css: {
            loaders: [lightningcssLoader],
        },
    },
    declaration: false,
    fileCache: true,
});
