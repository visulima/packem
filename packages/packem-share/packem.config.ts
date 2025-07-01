import type { BuildConfig } from "@visulima/packem/config";
import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    runtime: "node",
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
    },
    transformer,
    validation: {
        dependencies: {
            unused: {
                // TODO: remove this, currently the type process dont provide the info for the validation
                exclude: ["@visulima/package", "@visulima/pail"]
            }
        }
    }
}) as BuildConfig;