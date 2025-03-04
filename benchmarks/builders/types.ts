export interface BuilderOptions {
    /**
     * Project name to build (e.g., 'react-empty', 'react-large')
     */
    project: string;

    /**
     * Entry point file relative to project directory
     * @default "src/index.tsx"
     */
    entrypoint?: string;

    /**
     * Build output directory
     * @default "./builds"
     */
    outDir?: string;

    /**
     * Builder-specific preset/transformer to use
     * @example "esbuild" | "swc" | "babel" for rollup
     */
    preset?: string;

    /**
     * Additional builder-specific options
     */
    options?: Record<string, unknown>;
}

export interface Builder {
    /**
     * Name of the builder
     */
    name: string;

    /**
     * Supported presets for this builder
     */
    supportedPresets?: string[];

    /**
     * Build function that processes the project
     * @returns Path to the build output directory
     */
    build(options: BuilderOptions): Promise<string>;

    /**
     * Clean up any temporary files or resources
     * @returns Promise that resolves when cleanup is complete
     */
    cleanup?(options: BuilderOptions): Promise<void>;

    /**
     * Move build output to a different location
     * @param options Builder options containing project and path information
     * @returns Promise that resolves to the new build output path
     */
    move?(options: BuilderOptions): Promise<void>;
}
