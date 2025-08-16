import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import tailwindcssLoader from "@visulima/packem/css/loader/tailwindcss";
import sourceMapLoader from "@visulima/packem/css/loader/sourcemap";
import cssnanoMinifier from "@visulima/packem/css/minifier/cssnano";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "browser",
    transformer,
    rollup: {
        css: {
            mode: "extract",
            loaders: [tailwindcssLoader, sourceMapLoader],
            minifier: cssnanoMinifier
        },
    },
    declaration: "node16"
});
