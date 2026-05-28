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
            // .d.ts. All other externals stay external.
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
        },
    },
    transformer,
}) as BuildConfig;
