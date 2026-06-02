import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "node",
    // This package is private and inlined into rollup/rolldown adapter packages at
    // their build time. The deps here are NOT peerDeps (the package has no public
    // consumers), so they wouldn't be auto-externalised — we list them explicitly
    // so they stay `import` declarations in the emitted JS rather than being
    // bundled in. The adapter packages (which DO publish) carry the matching
    // peerDeps so end users install them.
    externals: ["@babel/core", "oxc-transform", "rollup", "typescript", "workerpool"],
    rollup: {
        dts: {
            oxc: true,
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
        },
    },
    transformer,
}) as BuildConfig;
