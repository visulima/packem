import type { BuildConfig, BuildPreset, Environment, Mode } from "./types";

type BuildConfigFunction = (enviroment: Environment, mode: Mode) => BuildConfig;

// eslint-disable-next-line import/no-unused-modules
export type { BuildConfig, BuildHooks, BuildPreset } from "./types";

export const defineConfig = (config: BuildConfig | BuildConfigFunction): BuildConfig | BuildConfigFunction => config;

// eslint-disable-next-line import/no-unused-modules
export const definePreset = (preset: BuildPreset): BuildPreset => preset;
