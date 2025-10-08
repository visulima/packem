/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
declare module "clean-css/lib/options/optimization-level.js" {
    import type { OptimizationsOptions, Options } from "clean-css";

    export interface OptimizationLevel {
        One: "1";
        Two: "2";
        Zero: "0";
    }

    export const OptimizationLevel: OptimizationLevel;

    export interface OptimizationLevelOptions {
        [OptimizationLevel.One]: Required<Omit<Exclude<OptimizationsOptions["1"], undefined>, "all">>;
        [OptimizationLevel.Two]: Required<Omit<Exclude<OptimizationsOptions["2"], undefined>, "all">>;
        [OptimizationLevel.Zero]: {};
    }

    export function optimizationLevelFrom(source: Options["level"]): OptimizationLevelOptions;
}
