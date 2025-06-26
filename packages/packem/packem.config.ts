import { defineConfig } from "./src/config";
import { esbuildPlugin as transformer } from "@visulima/packem-rollup";
import isolatedDeclarationTransformer from "@visulima/packem-rollup/dts/isolated/transformer/typescript";

export default defineConfig({
    cjsInterop: true,
    isolatedDeclarationTransformer,
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
    validation: {
        dependencies: {
            hoisted: {
                exclude: ["estree"],
            },
            unused: {
                exclude: ["@rollup/plugin-inject"],
            },
        },
    },
});
