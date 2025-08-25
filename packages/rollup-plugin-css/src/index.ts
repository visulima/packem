/**
 * CSS Modules TypeScript declaration generator plugin.
 *
 * This plugin generates TypeScript declaration files (.d.ts) for CSS modules,
 * enabling type-safe CSS class name usage in TypeScript projects. It works
 * in conjunction with the main CSS plugin to provide a complete CSS modules
 * development experience.
 *
 * Features:
 * - Automatic .d.ts file generation for CSS modules
 * - Support for custom naming patterns
 * - Integration with build tools and IDEs
 * - Real-time updates during development
 * @example
 * ```typescript
 * // Usage alongside main CSS plugin
 * import { rollupCssPlugin, cssModulesTypesPlugin } from '@packem/rollup-plugin-css';
 *
 * export default {
 *   plugins: [
 *     rollupCssPlugin({ modules: true }),
 *     cssModulesTypesPlugin()
 *   ]
 * };
 * ```
 * @example
 * ```typescript
 * // Generated .d.ts file example
 * // styles.module.css.d.ts
 * declare const styles: {
 *   readonly container: string;
 *   readonly button: string;
 *   readonly active: string;
 * };
 * export default styles;
 * ```
 */
export { default as cssModulesTypesPlugin } from "./css-modules-types";
export { default as rollupCssPlugin } from "./css-plugin";
export type * from "./types";
