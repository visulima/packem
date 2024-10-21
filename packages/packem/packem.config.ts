// import typedocBuilder from "./src/builder/typedoc";
import { defineConfig } from "./src/config";
import transformer from "./src/rollup/plugins/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    // builder: {
    //     typedoc: typedocBuilder,
    // },
    cjsInterop: true,
    externals: ["stylus", "less", "sass", "node-sass", "postcss", "lightningcss"],
    fileCache: true,
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
        node10Compatibility: {
            typeScriptVersion: ">=5.0",
            writeToPackageJson: true,
        },
    },
    transformer,
    // typedoc: {
    //     format: "inline",
    //     readmePath: "./README.md",
    // },
});
