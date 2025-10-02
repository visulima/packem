import type { TsConfigJson } from "get-tsconfig";
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
