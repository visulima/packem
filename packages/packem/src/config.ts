import type { BuildConfig, BuildPreset, Environment, Mode } from "./types";

export type BuildConfigFunction = (enviroment: Environment, mode: Mode) => BuildConfig | Promise<BuildConfig>;

// eslint-disable-next-line import/no-unused-modules
export type { BuildConfig, BuildHooks, BuildPreset } from "./types";

/**
 * Define a build configuration.
 *
 * @param {BuildConfig | BuildConfigFunction} config
 * @returns {BuildConfig | BuildConfigFunction}
 */
export const defineConfig = (config: BuildConfig | BuildConfigFunction): BuildConfig | BuildConfigFunction => config;

/**
 * Define a build preset.
 *
 * @param {BuildPreset} preset
 * @returns {BuildPreset}
 */

// eslint-disable-next-line import/no-unused-modules
export const definePreset = (preset: BuildPreset): BuildPreset => preset;
