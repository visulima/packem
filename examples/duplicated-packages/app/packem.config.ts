import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    // This example intentionally bundles two versions of `ms` to demonstrate the
    // duplicate detector, which makes pnpm hoist it "shamefully" and emits a few
    // validation warnings. Don't let those fail the example build.
    failOnWarn: false,
    transformer,
    validation: false,
});
