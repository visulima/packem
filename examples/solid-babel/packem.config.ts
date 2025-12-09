import { defineConfig } from "@visulima/packem/config";
import { createSolidPreset } from "@visulima/packem/config/preset/solid";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "browser",
    transformer,
    preset: createSolidPreset({
        solidOptions: {
            generate: "dom",
            hydratable: false,
        },
    }),
});
