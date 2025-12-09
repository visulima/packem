import { defineConfig } from "@visulima/packem/config";
import { createReactPreset } from "@visulima/packem/config/preset/react";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "browser",
    transformer,
    preset: createReactPreset({
        compiler: {
            compilationMode: "infer",
            panicThreshold: "critical_errors",
        },
    }),
});
