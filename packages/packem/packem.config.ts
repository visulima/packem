import { defineConfig } from "./src/config";
import transformer from "./src/rollup/plugins/esbuild";
import isolatedDeclarationTransformer from "./src/rollup/plugins/typescript/isolated-declarations-typescript-transformer";

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
});
