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
        // workerpool spawns the babel worker as a real on-disk module at runtime,
        // so it must stay an external `import`/`require` rather than be bundled in.
        "workerpool",
    ],
    rollup: {
        // The parallel babel transform spawns a worker thread, which workerpool can
        // only load from a real on-disk file. packem-plugins is otherwise inlined, so
        // we copy its built babel worker (and the transform-code chunk it imports) into
        // our own dist. The nested `babel-runtime/plugins/babel/` layout preserves the
        // worker's `../../packem_shared/…` import depth so the chunk resolves at runtime.
        // Kept in sync with WORKER_RELATIVE_PATH in packem-plugins' babel plugin.
        copy: {
            flatten: true,
            targets: [
                {
                    dest: "babel-runtime/plugins/babel",
                    src: "../packem-plugins/dist/plugins/babel/worker.js",
                },
                {
                    dest: "babel-runtime/packem_shared",
                    src: "../packem-plugins/dist/packem_shared/transform-code-*.js",
                },
            ],
        },
        dts: {
            oxc: true,
            // packem-plugins is private and bundled into our JS, so its types have to
            // come along too — otherwise the emitted declarations import a package no
            // consumer can install.
            resolve: ["@visulima/packem-plugins", /^@visulima\/packem-plugins\//],
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
