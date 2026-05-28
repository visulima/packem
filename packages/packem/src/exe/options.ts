import type { ExeExtensionOptions } from "./platform";

export interface ExeChunk {
    path: string;
    type?: string;
}

export interface SeaConfig {
    /** Optional, embedded asset mappings. */
    assets?: Record<string, string>;
    /** @default true */
    disableExperimentalSEAWarning?: boolean;
    /** Extra Node.js CLI arguments embedded into the executable. */
    execArgv?: string[];
    /** @default "env" */
    execArgvExtension?: "cli" | "env" | "none";
    /** Optional; if not specified, uses the current Node.js binary. */
    executable?: string;
    main?: string;
    mainFormat?: "commonjs" | "module";
    output?: string;
    /** @default false */
    useCodeCache?: boolean;
    /** @default false */
    useSnapshot?: boolean;
}

export interface ExeOptions extends ExeExtensionOptions {
    /**
     * Output file name without any suffix or extension.
     * For example, do not include `.exe`, platform suffixes, or architecture suffixes.
     */
    fileName?: ((chunk: ExeChunk) => string) | string;

    /**
     * Output directory for executables.
     * @default "build"
     */
    outDir?: string;

    /**
     * Node.js SEA configuration passthrough.
     * @see https://nodejs.org/api/single-executable-applications.html#generating-single-executable-applications-with---build-sea
     */
    seaConfig?: Omit<SeaConfig, "main" | "mainFormat" | "output">;
}
