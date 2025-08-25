/* eslint-disable import/no-extraneous-dependencies */
import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    cjsInterop: true,
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
        node10Compatibility: {
            typeScriptVersion: ">=5.5",
            writeToPackageJson: true,
        },
    },
    runtime: "node",
    transformer,
}) as BuildConfig;
