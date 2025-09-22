import type { BuildConfig, BuildConfigFunction, BuildPreset } from "../types";

export type { BuildConfig, BuildConfigFunction, BuildPreset } from "../types";
export type { BuildHooks } from "@visulima/packem-share/types";

/**
 * Defines a build configuration for Packem.
 * Supports both static configuration objects and dynamic configuration functions.
 * @param config Static build configuration object or function returning configuration
 * @returns The provided configuration
 * @example
 * ```typescript
 * // Static configuration
 * export default defineConfig({
 *   entries: ['./src/index.ts'],
 *   outDir: './dist'
 * });
 *
 * // Dynamic configuration
 * export default defineConfig((env, mode) => ({
 *   entries: ['./src/index.ts'],
 *   outDir: env === 'production' ? './dist' : './dev'
 * }));
 * ```
 * @public
 */
export const defineConfig = (config: BuildConfig | BuildConfigFunction): BuildConfig | BuildConfigFunction => config;

/**
 * Defines a build preset for Packem.
 * Build presets provide reusable configuration templates that can be shared across projects.
 * @param preset Build preset configuration
 * @returns The provided preset configuration
 * @example
 * ```typescript
 * export default definePreset({
 *   name: 'my-preset',
 *   defaults: {
 *     entries: ['./src/index.ts'],
 *     outDir: './dist'
 *   },
 *   hooks: {
 *     'build:before': (context) => {
 *       // Custom build preparation logic
 *     }
 *   }
 * });
 * ```
 * @public
 */

export const definePreset = (preset: BuildPreset): BuildPreset => preset;
