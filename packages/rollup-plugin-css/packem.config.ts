import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "node",
    rollup: {
        dts: {
            // Keep peer/optional deps external in emitted .d.ts. Their authored types
            // (postcss, cssnano, css-functions-list, …) ship namespace-style declarations
            // and self-referential .d.mts/.d.ts pairs that don't bundle cleanly — the
            // consumer's installed copies provide the types at use site.
            resolve: false,
        },
        license: {
            path: "./LICENSE.md",
        },
    },
    transformer,
}) as BuildConfig;
