/**
 * Configuration options for the Tailwind Oxide loader.
 *
 * These options control how Tailwind CSS is processed and compiled.
 * @example
 * ```typescript
 * const tailwindOptions: TailwindOxideLoaderOptions = {
 *   // Enable source maps
 *   sourceMap: true,
 *
 *   // Custom Tailwind config path
 *   config: './tailwind.config.js',
 *
 *   // Enable JIT mode
 *   jit: true
 * };
 * ```
 */
export interface TailwindOxideLoaderOptions {
    /**
     * Path to Tailwind CSS configuration file
     * @default undefined (auto-detect)
     */
    config?: string;

    /**
     * Enable Just-In-Time (JIT) mode for faster builds
     * @default true
     */
    jit?: boolean;

    /**
     * Enable source map generation
     * @default false
     */
    sourceMap?: boolean;

    /**
     * Custom content paths for scanning
     * @default ['**/*.{html,js,ts,jsx,tsx}']
     */
    content?: string[];

    /**
     * Enable CSS purging in production
     * @default true
     */
    purge?: boolean;

    /**
     * Custom PostCSS plugins to run after Tailwind
     */
    postcss?: any[];

    /**
     * Enable autoprefixer
     * @default true
     */
    autoprefixer?: boolean;

    /**
     * Custom CSS output path
     */
    output?: string;

    /**
     * Enable CSS minification in production
     * @default true
     */
    minify?: boolean;
}



