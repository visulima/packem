/**
 * Default PostCSS file extensions for configuration file detection.
 *
 * These extensions are used when searching for PostCSS configuration files
 * in the project directory hierarchy. Supports both CommonJS and ES module formats.
 * @example
 * ```typescript
 * // Configuration files that will be detected:
 * // - postcss.config.js
 * // - postcss.config.mjs
 * // - postcss.config.cjs
 * // - .postcssrc.js
 * // - .postcssrc.mjs
 * // - .postcssrc.cjs
 * ```
 */
export const POSTCSS_EXTENSIONS = [".js", ".mjs", ".cjs"];

export const HASH_REGEXP: RegExp = /\[hash(?::(\d+))?\]/;

export const FIRST_EXTENSION_REGEXP: RegExp = /(?<!^|[/\\])(\.[^\s.]+)/;

export const DATA_URI_REGEXP: RegExp = /data:[^\n\r;]+(?:;charset=[^\n\r;]+)?;base64,([\d+/A-Za-z]+={0,2})/;
