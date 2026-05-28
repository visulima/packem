import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "node",
    rollup: {
        dts: {
            oxc: true,
            // `@visulima/packem-plugins` is private (unpublished) and consumed via
            // build-time inlining, so its types MUST be inlined into the emitted
            // .d.ts — otherwise downstream consumers of `@visulima/packem-rollup`
            // hit unresolved `import ... from "@visulima/packem-plugins/*"` at
            // type-check time. All other externals (e.g. @babel/core, @rollup/*,
            // esbuild) ship their own published types and stay external.
            resolve: [/^@visulima\/packem-plugins(\/|$)/],
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
