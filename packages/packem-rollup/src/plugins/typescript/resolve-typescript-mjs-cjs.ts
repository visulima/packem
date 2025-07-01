/**
 * Modified copy of https://github.com/privatenumber/pkgroll/blob/develop/src/utils/rollup-plugins/resolve-typescript-mjs-cjs.ts
 *
 * MIT License
 *
 * Copyright (c) Hiroki Osame &lt;hiroki.osame@gmail.com>
 */
import type { Plugin } from "rollup";

const resolveTypescriptMjsCts = (): Plugin => {
    const isJs = /\.(?:[mc]?js|jsx)$/;

    return {
        name: "packem:resolve-typescript-mjs-cjs",
        async resolveId(id, importer, options) {
            if (isJs.test(id) && importer) {
                return await this.resolve(id.replace(/js(x?)$/, "ts$1"), importer, options);
            }

            return undefined;
        },
    };
};

export default resolveTypescriptMjsCts;
