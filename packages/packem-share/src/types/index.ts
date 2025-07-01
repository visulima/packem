import type { PackageJson } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { Hookable } from "hookable";
import type { Jiti } from "jiti";
import type { RollupBuild, RollupOptions, RollupWatcher } from "rollup";

import type { Environment, Mode } from "./core";

export type { Environment, Format, Mode, Runtime } from "./core";
export interface BuildHooks<T> {
    "build:before": (context: BuildContext<T>) => Promise<void> | void;
    "build:done": (context: BuildContext<T>) => Promise<void> | void;
    "build:prepare": (context: BuildContext<T>) => Promise<void> | void;

    "builder:before": (name: string, context: BuildContext<T>) => Promise<void> | void;
    "builder:done": (name: string, context: BuildContext<T>) => Promise<void> | void;

    "rollup:build": (context: BuildContext<T>, build: RollupBuild) => Promise<void> | void;
    "rollup:done": (context: BuildContext<T>) => Promise<void> | void;
    "rollup:dts:build": (context: BuildContext<T>, build: RollupBuild) => Promise<void> | void;

    "rollup:dts:done": (context: BuildContext<T>) => Promise<void> | void;
    "rollup:dts:options": (context: BuildContext<T>, options: RollupOptions) => Promise<void> | void;

    "rollup:options": (context: BuildContext<T>, options: RollupOptions) => Promise<void> | void;
    "rollup:watch": (context: BuildContext<T>, watcher: RollupWatcher) => Promise<void> | void;

    // @deprecated Use "builder:before" instead
    "typedoc:before": (context: BuildContext<T>) => Promise<void> | void;
    // @deprecated Use "builder:done" instead
    "typedoc:done": (context: BuildContext<T>) => Promise<void> | void;

    "validate:before": (context: BuildContext<T>) => Promise<void> | void;
    "validate:done": (context: BuildContext<T>) => Promise<void> | void;
}

export type BuildContext<T> = {
    buildEntries: (BuildContextBuildAssetAndChunk | BuildContextBuildEntry)[];
    dependencyGraphMap: Map<string, Set<[string, string]>>;
    environment: Environment;
    hoistedDependencies: Set<string>;
    hooks: Hookable<BuildHooks<T>>;
    implicitDependencies: Set<string>;
    jiti: Jiti;
    logger: Pail;
    mode: Mode;
    options: T;
    pkg: PackageJson;
    tsconfig?: TsConfigResult;
    usedDependencies: Set<string>;
    warnings: Set<string>;
};

export type BuildContextBuildAssetAndChunk = {
    chunk?: boolean;
    chunks?: string[];
    dynamicImports?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    size?: {
        brotli?: number;
        bytes?: number;
        gzip?: number;
    };
    type?: "asset" | "chunk";
};

export type BuildContextBuildEntry = {
    chunk?: boolean;
    chunks?: string[];
    dynamicImports?: string[];
    exports?: string[];
    modules?: { bytes: number; id: string }[];
    path: string;
    size?: {
        brotli?: number;
        bytes?: number;
        gzip?: number;
    };
    type?: "entry";
};
