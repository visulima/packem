import type { RenderOptions } from "stylus";

/**
 * Configuration options for the Stylus loader.
 *
 * Extends the standard Stylus RenderOptions with loader-specific functionality.
 * These options are passed to the Stylus compiler during processing.
 * @example
 * ```typescript
 * const stylusOptions: StylusLoaderOptions = {
 *   // Include paths for import resolution
 *   paths: ['./styles', './node_modules'],
 *
 *   // Stylus functions and variables
 *   define: {
 *     '$primary-color': '#007acc'
 *   },
 *
 *   // Enable/disable features
 *   compress: true,
 *   linenos: false
 * };
 * ```
 * @see {@link https://stylus-lang.com/docs/js.html} Stylus.js API Documentation
 */
export type StylusLoaderOptions = RenderOptions;
