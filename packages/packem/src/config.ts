import type { BuildConfig, BuildPreset, Environment, Mode } from "./types";

export type BuildConfigFunction = (enviroment: Environment, mode: Mode) => BuildConfig | BuildConfig[] | Promise<BuildConfig | BuildConfig[]>;

// eslint-disable-next-line import/no-unused-modules
export type { BuildConfig, BuildHooks, BuildPreset } from "./types";

export const defineConfig = (config: BuildConfig | BuildConfig[] | BuildConfigFunction): BuildConfig | BuildConfig[] | BuildConfigFunction => config;

// eslint-disable-next-line import/no-unused-modules
export const definePreset = (preset: BuildPreset): BuildPreset => preset;
