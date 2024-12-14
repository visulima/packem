import { defineConfig } from "./src/config";
import transformer from "./src/rollup/plugins/esbuild";
import isolatedDeclarationTransformer from "./src/rollup/plugins/typescript/isolated-declarations-typescript-transformer";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    cjsInterop: true,
    experimental: {
        oxcResolve: true,
    },
    fileCache: true,
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
    transformer,
});
