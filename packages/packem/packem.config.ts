import { defineConfig } from "./src/config";
import { esbuildPlugin as transformer } from "@visulima/packem-rollup/esbuild";
import { isolatedDeclarationsTypescriptTransformer as isolatedDeclarationTransformer } from "@visulima/packem-rollup/typescript";

export default defineConfig({
    cjsInterop: true,
    // isolatedDeclarationTransformer, // Temporarily disabled for local development
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
        "@visulima/fs",
        "@visulima/package",
        "@visulima/packem-rollup",
        "@visulima/path",
        "@visulima/source-map",
        "es-module-lexer",
        "glob-parent",
        "oxc-parser",
        "oxc-resolver",
        "rollup-plugin-dts",
        "rollup-plugin-license",
        "rollup-plugin-polyfill-node",
        "rollup-plugin-pure",
        "rollup-plugin-visualizer",
        "@babel/parser", "oxc-resolver", "es-module-lexer", "@rollup/plugin-alias", 
"@rollup/plugin-commonjs", "@rollup/plugin-dynamic-import-vars", "@rollup/plugin-inject", "@rollup/plugin-node-resolve", 
"@rollup/plugin-replace", "@rollup/plugin-wasm", "rollup-plugin-polyfill-node", "rollup-plugin-pure", "rollup-plugin-visualizer", "oxc-parser", 
"@rollup/plugin-json", "glob-parent", "rollup-plugin-license", "@visulima/source-map", "rollup-plugin-dts"
    ],
    rollup: {
        isolatedDeclarations: {
            exclude: ["src/rollup/plugins/**/*"],
        },
        license: {
            path: "./LICENSE.md",
        }
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
