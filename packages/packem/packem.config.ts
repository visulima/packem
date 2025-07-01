import { esbuildPlugin as transformer } from "@visulima/packem-rollup/esbuild";

import { defineConfig } from "./src/config";

export default defineConfig({
    cjsInterop: true,
    externals: [
        "@visulima/css-style-inject",
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
        "es-module-lexer",
        "glob-parent",
        "oxc-parser",
        "oxc-resolver",
    ],
    rollup: {
        license: {
            path: "./LICENSE.md",
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
