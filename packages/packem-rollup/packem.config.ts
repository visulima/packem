import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "node",
    rollup: {
        dts: {
            // Keep all node_modules types external in the emitted .d.ts. Several optional
            // peer deps (e.g. @babel/core) ship .d.ts files that depend on global ambient
            // types or use TS-only syntax our fake-js transform doesn't handle, so
            // attempting to inline them breaks the build. Consumers install peers anyway,
            // so external `import` declarations resolve correctly at type-check time.
            resolve: false,
        },
        license: {
            path: "./LICENSE.md",
        },
    },
    validation: {
        dependencies: {
            hoisted: {
                exclude: ["estree"],
            },
            unused: {
                exclude: ["@visulima/rollup-plugin-dts"],
            },
        },
    },
    transformer,
}) as BuildConfig;
