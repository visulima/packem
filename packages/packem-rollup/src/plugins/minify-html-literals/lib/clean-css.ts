/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CleanCssOptions = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CleanCssOptimizationsOptions = any;

export interface OptimizationLevel {
    One: "1";
    Two: "2";
    Zero: "0";
}

export interface OptimizationLevelOptions {
    [key: string]: Required<Omit<Exclude<CleanCssOptimizationsOptions, undefined>, "all">>;
}

export declare const OptimizationLevel: OptimizationLevel;

export declare function optimizationLevelFrom(source: CleanCssOptions): OptimizationLevelOptions;
