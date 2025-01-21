import type { BuildConfig, BuildPreset, Environment, Mode } from "../types";

/**
 * Function type for dynamic build configuration.
 * Allows configuration to be generated based on environment and mode.
 *
 * @param environment - The build environment (development/production)
 * @param mode - The build mode (build/watch)
 * @returns Build configuration object or Promise resolving to one
 *
 * @public
 */
export type BuildConfigFunction = (environment: Environment, mode: Mode) => BuildConfig | Promise<BuildConfig>;

// eslint-disable-next-line import/no-unused-modules
export type { BuildConfig, BuildHooks, BuildPreset } from "../types";

/**
 * Defines a build configuration for Packem.
 * Supports both static configuration objects and dynamic configuration functions.
 *
 * @param config - Static build configuration object or function returning configuration
 * @returns The provided configuration
 *
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
 *
 * @public
 */
export const defineConfig = (config: BuildConfig | BuildConfigFunction): BuildConfig | BuildConfigFunction => config;

/**
 * Defines a build preset for Packem.
 * Build presets provide reusable configuration templates that can be shared across projects.
 *
 * @param preset - Build preset configuration
 * @returns The provided preset configuration
 *
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
 *
 * @public
 */
// eslint-disable-next-line import/no-unused-modules
export const definePreset = (preset: BuildPreset): BuildPreset => preset;
