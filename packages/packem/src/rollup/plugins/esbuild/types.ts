/**
 * Modified copy of https://github.com/egoist/rollup-plugin-esbuild/blob/dev/src/index.ts
 *
 * MIT License
 *
 * Copyright (c) 2020 EGOIST
 */
import type { FilterPattern } from "@rollup/pluginutils";
import type { Pail } from "@visulima/pail";
import type { BuildOptions as EsbuildOptions, Loader, TransformOptions } from "esbuild";

type MarkOptional<Type, Keys extends keyof Type> = Type extends Type ? Omit<Type, Keys> & Partial<Pick<Type, Keys>> : never;

export type Options = {
    exclude?: FilterPattern;
    include?: FilterPattern;
    /**
     * Map extension to esbuild loader
     * Note that each entry (the extension) needs to start with a dot
     */
    loaders?: Record<string, Loader | false>;
    optimizeDeps?: MarkOptional<OptimizeDepsOptions, "cwd" | "sourceMap">;
    sourceMap?: boolean;
} & Omit<TransformOptions, "loader" | "sourcemap">;

export type OptimizeDepsOptions = {
    cwd: string;
    esbuildOptions?: EsbuildOptions;
    exclude?: string[];
    include: string[];
    sourceMap: boolean;
};

export type Optimized = Map<string, { file: string }>;

export type OptimizeDepsResult = {
    cacheDir: string;
    optimized: Optimized;
};

export type EsbuildPluginConfig = {
    logger: Pail;
} & Options;
