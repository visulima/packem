import { createDebug } from "obug";
import ts from "typescript";

import { getLanguageFingerprint } from "../custom-language.js";
import type { TscContext } from "./context.js";
import { createContext, getSharedContext } from "./context.js";
import tscEmitBuild from "./emit-build.js";
import tscEmitCompiler from "./emit-compiler.js";
import type { TscOptions, TscResult } from "./types.js";

const debug = createDebug("rollup-plugin-dts:tsc");

// eslint-disable-next-line unicorn/no-top-level-side-effects -- records the compiler version once per process, which is the point of the line
debug(`loaded typescript: ${ts.version}`);

// Without an explicit context, builds with the same languages share one program cache. A language without an id
// cannot be told apart from another language set, so it gets a cache of its own.
const contextFor = (options: TscOptions): TscContext => {
    const fingerprint = getLanguageFingerprint(options);

    return fingerprint === undefined ? createContext() : getSharedContext(fingerprint);
};

export const tscEmit = (tscOptions: TscOptions): TscResult => {
    debug(`running tscEmit ${tscOptions.id}`);

    const options: TscOptions = tscOptions.context ? tscOptions : { ...tscOptions, context: contextFor(tscOptions) };

    if (options.build) {
        return tscEmitBuild(options);
    }

    return tscEmitCompiler(options);
};

export type { TscModule, TscOptions, TscResult } from "./types.js";
