import type { TsConfigJson } from "@visulima/tsconfig";
import type { SourceMapInput } from "rollup";
import type ts from "typescript";

import type { TscContext } from "./context.js";

export interface TscModule {
    file: ts.SourceFile;
    program: ts.Program;
}

export interface TscOptions {
    build: boolean;
    context?: TscContext;
    cwd: string;
    entries?: string[];
    id: string;
    incremental: boolean;
    sourcemap: boolean;
    tsconfig?: string;
    tsconfigRaw: TsConfigJson;
    tsMacro?: boolean;
    vue?: boolean;
}

export interface TscResult {
    code?: string;
    error?: string;
    map?: SourceMapInput;
}

/** Request sent from the plugin to the forked tsc worker. */
export interface WorkerRequest {
    id: number;
    options: Omit<TscOptions, "programs">;
}

/** Reply for a {@link WorkerRequest}, correlated back to it by `id`. */
export interface WorkerResponse {
    id: number;
    result: TscResult;
}
