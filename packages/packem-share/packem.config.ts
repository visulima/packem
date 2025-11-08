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
        isolatedDeclarations: {
            exclude: /node_modules/,
            ignoreErrors: false,
            include: /\.(?:m|c)?(?:j|t)sx?$|\.d\.(?:m|c)?ts$/,
        },
    },
    transformer,
    validation: {
        dependencies: {
            unused: {
                // TODO: remove this, currently the type process dont provide the info for the validation
                exclude: ["@visulima/package", "@visulima/pail"],
            },
        },
    },
}) as BuildConfig;
