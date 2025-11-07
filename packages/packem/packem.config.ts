import { esbuildPlugin as transformer } from "@visulima/packem-rollup/esbuild";

import isolatedDeclarationTransformer from "./src/rollup/plugins/typescript/isolated-declarations-typescript-transformer";

import { defineConfig } from "./src/config";

export default defineConfig({
    cjsInterop: true,
    isolatedDeclarationTransformer,
    externals: [
        "@babel/parser",
        "@rollup/plugin-alias",
        "@rollup/plugin-commonjs",
        "@rollup/plugin-dynamic-import-vars",
        "@rollup/plugin-inject",
        "@rollup/plugin-json",
        "@rollup/plugin-node-resolve",
        "@rollup/plugin-replace",
        "@rollup/plugin-wasm",
        "@rollup/pluginutils",
        "rollup-plugin-visualizer",
        "rollup-plugin-polyfill-node",
        "rollup-plugin-pure",
        "rollup-plugin-dts",
        "rollup-plugin-license",
        "rs-module-lexer",
        "glob-parent",
        "oxc-parser",
        "oxc-resolver",
    ],
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
        requireCJS: {
            builtinNodeModules: true,
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
