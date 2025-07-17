import type less from "less";

/**
 * Configuration options for the Less loader.
 *
 * Extends the standard Less.Options with additional loader-specific settings.
 * These options are passed directly to the Less compiler during processing.
 * @example
 * ```typescript
 * const lessOptions: LESSLoaderOptions = {
 *   // Less compiler options
 *   math: 'parens-division',
 *   strictUnits: true,
 *
 *   // Custom plugins
 *   plugins: [myLessPlugin],
 *
 *   // Global variables
 *   globalVars: {
 *     'primary-color': '#007acc'
 *   }
 * };
 * ```
 * @see {@link https://lesscss.org/usage/#less-options} Less.js Options Documentation
 */
export type LESSLoaderOptions = typeof less.options;
