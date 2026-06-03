import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    preset: "none",
    entries: ["./types/*.types.ts"],
    declaration: true,
    transformer,
    // This package ships type declarations only (no runtime entry), so there is
    // intentionally no `main` field to validate.
    validation: {
        packageJson: {
            main: false,
        },
    },
    rollup: {
        node10Compatibility: {
            writeToPackageJson: true,
        },
    },
});
