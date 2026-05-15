/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */

export interface OptimizationLevel {
    One: "1";
    Two: "2";
    Zero: "0";
}

export interface OptimizationLevelOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- clean-css types are intentionally permissive here
    [key: string]: Required<Omit<Exclude<any, undefined>, "all">>;
}

export declare const OptimizationLevel: OptimizationLevel;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- clean-css types are intentionally permissive here
export declare function optimizationLevelFrom(source: any): OptimizationLevelOptions;
