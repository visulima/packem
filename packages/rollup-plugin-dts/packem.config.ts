/* eslint-disable import/no-extraneous-dependencies */
import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
import isolatedDeclarationTransformer from "@visulima/packem/dts/isolated/transformer/typescript";

export default defineConfig({
    node10Compatibility: {
        typeScriptVersion: ">=5.5",
        writeToPackageJson: true,
    },
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
    },
    runtime: "node",
    transformer,
    isolatedDeclarationTransformer,
}) as BuildConfig;
