import typedocBuilder from "@visulima/packem/builder/typedoc";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    transformer,
    builder: {
        typedoc: typedocBuilder,
    },
    typedoc: {
        readmePath: "./README.md",
    },
});
