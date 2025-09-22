import cssnanoMinifier from "@visulima/packem/css/minifier/cssnano";
import tailwindcssLoader from "@visulima/packem/css/loader/tailwindcss";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "browser",
    transformer,
    rollup: {
        css: {
            mode: "extract",
            minifier: cssnanoMinifier,
            loaders: [tailwindcssLoader],
        },
    },
    declaration: "node16",
});
