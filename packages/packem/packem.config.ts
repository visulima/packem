import { esbuildPlugin as transformer } from "@visulima/packem-rollup/esbuild";

import { defineConfig } from "./src/config";

export default defineConfig({
    cjsInterop: true,
    externals: [
        "@babel/parser",
        "@rolldown/node",
        "@rollup/plugin-alias",
        "@rollup/plugin-commonjs",
        "@rollup/plugin-dynamic-import-vars",
        "@rollup/plugin-inject",
        "@rollup/plugin-json",
        "@rollup/plugin-node-resolve",
        "@rollup/plugin-replace",
        "@rollup/plugin-wasm",
        "@rollup/pluginutils",
        "rolldown",
        "rollup-plugin-visualizer",
        "rollup-plugin-polyfill-node",
        "rollup-plugin-pure",
        "@visulima/rollup-plugin-dts",
        "rollup-plugin-license",
        "rs-module-lexer",
        "oxc-parser",
        "oxc-resolver",
    ],
    rollup: {
        dts: {
            oxc: true,
            // disabled till visulima is fixed
            resolve: false,
        },
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
                exclude: ["estree", "@rolldown/node", "rolldown"],
            },
            unused: {
                exclude: ["oxc-transform", "@rollup/plugin-inject"],
            },
        },
    },
});
