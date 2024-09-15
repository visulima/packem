import { defineConfig } from "./src/config";
import transformer from "./src/rollup/plugins/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    cjsInterop: true,
    fileCache: false,
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
        node10Compatibility: {
            typeScriptVersion: ">=5.0",
            writeToPackageJson: true,
        }
    },
    transformer,
});
