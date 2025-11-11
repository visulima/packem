import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/typescript";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "node",
    isolatedDeclarationTransformer,
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
    },
    validation: {
        dependencies: {
            hoisted: {
                exclude: ["estree"]
            },
            unused: {
                exclude: ["rollup-plugin-dts"],
            },
        },
    },
    transformer,
}) as BuildConfig;
