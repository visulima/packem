import { createDebug } from "obug";
import ts from "typescript";

import tscEmitBuild from "./emit-build.js";
import tscEmitCompiler from "./emit-compiler.js";
import type { TscOptions, TscResult } from "./types.js";

export type { TscModule, TscOptions, TscResult } from "./types.js";

const debug = createDebug("rollup-plugin-dts:tsc");

debug(`loaded typescript: ${ts.version}`);

export const tscEmit = (tscOptions: TscOptions): TscResult => {
    debug(`running tscEmit ${tscOptions.id}`);

    if (tscOptions.build) {
        return tscEmitBuild(tscOptions);
    }

    return tscEmitCompiler(tscOptions);
};
