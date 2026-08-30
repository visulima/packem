import { createDebug } from "obug";
import ts from "typescript";

import tscEmitBuild from "./emit-build.js";
import tscEmitCompiler from "./emit-compiler.js";
import type { TscOptions, TscResult } from "./types.js";

const debug = createDebug("rollup-plugin-dts:tsc");

// eslint-disable-next-line unicorn/no-top-level-side-effects -- records the compiler version once per process, which is the point of the line
debug(`loaded typescript: ${ts.version}`);

export const tscEmit = (tscOptions: TscOptions): TscResult => {
    debug(`running tscEmit ${tscOptions.id}`);

    if (tscOptions.build) {
        return tscEmitBuild(tscOptions);
    }

    return tscEmitCompiler(tscOptions);
};

export type { TscModule, TscOptions, TscResult } from "./types.js";
