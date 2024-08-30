import { defineConfig } from "./src/config";
import { EXCLUDE_REGEXP } from "./src/constants";
import transformer from "./src/rollup/plugins/esbuild";

// eslint-disable-next-line import/no-unused-modules
export default defineConfig({
    rollup: {
        license: {
            path: "./LICENSE.md",
        },
        preserveDirectives: {
            directiveRegex: /^['|"](use strict|client|server)['|"]$/,
            // this is a hack to exclude the files from the directive regex
            exclude: [EXCLUDE_REGEXP, /src\/rollup\/.*/, "src/create-bundler.ts"],
            include: [/\.(?:m|c)?(?:j|t)sx?$/],
        },
    },
    fileCache: false,
    transformer,
});
