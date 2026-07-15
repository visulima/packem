import { cwd, exit } from "node:process";

import type { Cli } from "@visulima/cerebro";
import { DEVELOPMENT_ENV, PRODUCTION_ENV } from "@visulima/packem-share/constants";
import { resolve } from "@visulima/path";
import { createJiti } from "jiti";

import { runFirstRunWizard } from "../../bundler/first-run-wizard";
import autoPreset from "../../config/preset/auto";
import loadEnvFile from "../../config/utils/load-env-file";
import loadPackemConfig from "../../config/utils/load-packem-config";
import loadPreset from "../../config/utils/load-preset";
import packem from "../../packem";
import type { BuildConfig, Environment, KillSignal, Mode, Runtime } from "../../types";
import { createDefuWithHooksMerger } from "../../utils/create-defu-with-hooks-merger";

/**
 * Shape of the parsed CLI options consumed by the build command.
 * Values originate from cerebro's argument parser and are narrowed here
 * so the rest of the command can be fully type-checked.
 */
interface BuildCommandOptions {
    analyze?: boolean;
    bundler?: "rolldown" | "rollup";
    cache?: boolean;
    cjsInterop?: boolean;
    clean?: boolean;
    config?: string;
    debug?: boolean;
    development?: boolean;
    dir?: string;
    dtsOnly?: boolean;
    env?: { key: string; value: string }[];
    envFile?: string;
    envPrefix?: string;
    exe?: boolean;
    external?: string[];
    jit?: boolean;
    killSignal?: KillSignal;
    license?: string;
    metafile?: boolean;
    minify?: boolean;
    noExternal?: boolean;
    onSuccess?: string;
    production?: boolean;
    runtime?: Runtime;
    sourcemap?: boolean;
    target?: string;
    tsconfig?: string;
    typedoc?: boolean;
    unbundle?: boolean;
    validation?: boolean;
    watch?: boolean;
}

/** Resolves the build mode from the parsed CLI options. */
const resolveMode = (options: BuildCommandOptions): Mode => {
    if (options.watch) {
        return "watch";
    }

    if (options.jit) {
        return "jit";
    }

    return "build";
};

/**
 * Splits `--env.KEY=value` entries into the NODE_ENV override and the
 * remaining compile-time replacement variables.
 */
const parseCliEnvVariables = (options: BuildCommandOptions): { cliEnvVariables: Record<string, string>; nodeEnvironment: string | undefined } => {
    let nodeEnvironment: string | undefined;
    const cliEnvVariables: Record<string, string> = {};

    if (options.env) {
        for (const environment of options.env) {
            if (environment.key === "NODE_ENV") {
                nodeEnvironment = environment.value;
            } else {
                cliEnvVariables[`process.env.${environment.key}`] = JSON.stringify(environment.value);
            }
        }
    }

    return { cliEnvVariables, nodeEnvironment };
};

/** Derives NODE_ENV from the `--production`/`--development` flags when not set explicitly. */
const resolveNodeEnvironment = (options: BuildCommandOptions, explicit: string | undefined): string | undefined => {
    if (explicit !== undefined) {
        return explicit;
    }

    if (options.production) {
        return PRODUCTION_ENV;
    }

    if (options.development) {
        return DEVELOPMENT_ENV;
    }

    return undefined;
};

/**
 * Expands the repeatable `--external` option into a flat list of package names.
 * Each value may itself be a comma-separated list (`--external lodash,react`), so the
 * comma-split groups are flattened. The result feeds `externals.include`, which the
 * externals plugin compiles per-entry with `getRegExps`; a nested `string[][]` there is
 * rejected as a "wrong entry type", so the flattening is what makes `--external` take effect.
 */
const collectExternals = (options: BuildCommandOptions): string[] => {
    const externals: string[] = [];

    if (options.external) {
        for (const extension of options.external) {
            externals.push(...extension.split(","));
        }
    }

    return externals;
};

/**
 * Creates and registers the build command with the CLI.
 * Handles various build modes, environment variables, and build configurations.
 * @param cli CLI instance to register the command with
 * @example
 * ```typescript
 * // Usage from command line:
 * // Build for production:
 * // packem build --production
 *
 * // Watch mode with development environment:
 * // packem build --watch --development
 *
 * // With custom environment variables:
 * // packem build --env.API_URL=http://api.example.com
 * ```
 * @internal
 */
const createBuildCommand = (cli: Cli<Console>): void => {
    cli.addCommand({
        description: "Build the package using the resolved packem configuration",

        execute: async ({ logger, options: rawOptions }): Promise<void> => {
            const options = rawOptions as BuildCommandOptions;
            const mode: Mode = resolveMode(options);

            // Process environment variables from CLI
            const { cliEnvVariables, nodeEnvironment: cliNodeEnvironment } = parseCliEnvVariables(options);

            // Determine NODE_ENV if not explicitly set
            const nodeEnvironment = resolveNodeEnvironment(options, cliNodeEnvironment);

            // Process external dependencies
            const externals = collectExternals(options);

            const rootPath = resolve(cwd(), options.dir ?? ".");

            // Run the first-run wizard before loading the packem config. The
            // wizard returns undefined when a packem.config already exists, so
            // the steady-state build path is unchanged. Bundler/transformer
            // dependency checks for an *existing* config happen later, in
            // packem core's ensure-installed pass.
            await runFirstRunWizard(rootPath);

            const jiti = createJiti(rootPath, { debug: options.debug });
            const { config: buildConfig, path: buildConfigPath } = await loadPackemConfig(
                jiti,
                rootPath,
                nodeEnvironment as Environment,
                mode,
                options.config ?? undefined,
            );

            logger.debug("Using packem config found at", buildConfigPath);

            // Process environment variables from .env file if specified
            // CLI options override config file options
            const envFile = options.envFile ?? buildConfig.envFile;
            const envPrefix = options.envPrefix ?? buildConfig.envPrefix ?? "PACKEM_";

            // Start with .env file variables (if any), then CLI env vars override them
            const environments: Record<string, string> = {};

            if (envFile) {
                const envFileVariables = await loadEnvFile(envFile, rootPath, envPrefix, {
                    info: (message: string) => {
                        logger.info(message);
                    },
                    warn: (message: string) => {
                        logger.warn(message);
                    },
                });

                Object.assign(environments, envFileVariables);
            }

            // CLI env vars override .env file vars
            Object.assign(environments, cliEnvVariables);

            const preset = await loadPreset(buildConfig.preset ?? "none", jiti);

            // When minify is enabled, sourcemap should be enabled by default, unless explicitly opted out
            if (options.minify && options.sourcemap === undefined) {
                options.sourcemap = true;
            }

            try {
                // Use custom defu that merges hooks instead of overwriting them
                const customDefu = createDefuWithHooksMerger();
                const mergedConfig = customDefu(buildConfig, autoPreset, preset, {
                    analyze: options.analyze,
                    bundler: options.bundler,
                    cjsInterop: options.cjsInterop,
                    clean: options.clean,
                    dtsOnly: options.dtsOnly,
                    externals,
                    killSignal: options.killSignal,
                    minify: options.minify ?? nodeEnvironment === PRODUCTION_ENV,
                    onSuccess: options.onSuccess,
                    rollup: {
                        esbuild: {
                            target: options.target,
                        },
                        license: {
                            path: options.license,
                        },
                        metafile: options.metafile,
                        ...Object.keys(environments).length > 0 || Object.keys(cliEnvVariables).length > 0
                            ? {
                                replace: {
                                    values: environments,
                                },
                            }
                            : {},
                        resolveExternals: options.noExternal
                            ? {
                                builtins: false,
                                deps: false,
                                devDeps: false,
                                optDeps: false,
                                peerDeps: false,
                            }
                            : {},
                    },
                    runtime: options.runtime,
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- logical OR of three boolean flags: sourcemap is enabled when ANY of metafile/analyze/sourcemap is true; `??` would not short-circuit on `false`.
                    sourcemap: options.metafile || options.analyze || options.sourcemap,
                    unbundle: options.unbundle,
                    // validation will take the default values
                    validation: options.validation === false ? false : {},
                    ...options.exe ? { exe: true } : {},
                    ...options.typedoc
                        ? {
                            typedoc: {
                                format: "html",
                            },
                        }
                        : {},
                });

                // --no-validation must override preset validation settings but not user-configured validation
                if (options.validation === false && !buildConfig.validation) {
                    mergedConfig.validation = false;
                }

                // --no-cache forces the file cache off regardless of config/preset.
                if (options.cache === false) {
                    mergedConfig.fileCache = false;
                }

                await packem(
                    rootPath,
                    mode,
                    nodeEnvironment as Environment,
                    // cerebro injects a Pail logger at runtime; the toolbox types it
                    // as the narrower `Console`, so widen it to what packem expects.
                    logger as unknown as Parameters<typeof packem>[3],
                    options.debug ?? false,
                    mergedConfig as unknown as BuildConfig,
                    options.tsconfig ?? undefined,
                );
            } catch (error) {
                logger.error(error);

                exit(1);
            }
        },
        name: "build",
        options: [
            {
                description: "Specify the bundler to use (rollup or rolldown)",
                name: "bundler",
                type: (input: string) => {
                    if (input === "rollup" || input === "rolldown") {
                        return input;
                    }

                    throw new Error("Invalid bundler. Use 'rollup' or 'rolldown'.");
                },
            },
            {
                defaultValue: ".",
                description: "The directory to build",
                name: "dir",
                type: String,
            },
            {
                alias: "t",
                description: "Environments to support. `target` in tsconfig.json is automatically added. Defaults to the current Node.js version.",
                name: "target",
            },
            {
                description: "Use a custom config file",
                name: "config",
                type: String,
            },
            {
                description: "Path to the tsconfig.json file",
                name: "tsconfig",
                type: String,
            },
            {
                description: "Minify the output",
                name: "minify",
                type: Boolean,
            },
            {
                description: "Generate sourcemaps (experimental)",
                name: "sourcemap",
                type: Boolean,
            },
            {
                conflicts: "jit",
                description: "Watch for changes",
                name: "watch",
                type: Boolean,
            },
            {
                conflicts: "watch",
                description: "Stub the package for JIT compilation",
                name: "jit",
                type: Boolean,
            },
            {
                description: "Compile-time environment variables (eg. --env.NODE_ENV=production)",
                multiple: true,
                name: "env",
                type: (input: string) => {
                    // Split only on the first `=` so values that themselves
                    // contain `=` (e.g. `API_URL=https://x?a=b`) are preserved.
                    const separatorIndex = input.indexOf("=");

                    if (separatorIndex === -1) {
                        return {
                            key: input,
                            value: "",
                        };
                    }

                    return {
                        key: input.slice(0, separatorIndex),
                        value: input.slice(separatorIndex + 1),
                    };
                },
            },
            {
                description: "Path to the .env file to load environment variables from",
                name: "env-file",
                type: String,
            },
            {
                description: "Prefix for environment variables to load from .env file (default: PACKEM_)",
                name: "env-prefix",
                type: String,
            },
            {
                defaultValue: false,
                description: "Generate meta file (experimental)",
                name: "metafile",
                type: Boolean,
            },
            {
                description: "Path to the license file",
                name: "license",
                type: String,
            },
            {
                conflicts: "watch",
                description: "Visualize and analyze the bundle",
                name: "analyze",
                type: Boolean,
            },
            {
                description: "CJS interop mode, can export default and named export, (experimental).",
                name: "cjsInterop",
                type: Boolean,
            },
            {
                conflicts: "development",
                description: "Run code in production environment",
                name: "production",
                type: Boolean,
            },
            {
                conflicts: "production",
                description: "Run code in development environment",
                name: "development",
                type: Boolean,
            },
            {
                description: "Do not clean the dist directory before building",
                name: "no-clean",
                type: Boolean,
            },
            {
                description: "Only generate .d.ts files",
                name: "dts-only",
                type: Boolean,
            },
            {
                description: "Disable the output validation",
                name: "no-validation",
                type: Boolean,
            },
            {
                description: "Disable the cache",
                name: "no-cache",
                type: Boolean,
            },
            {
                description: "Generate type documentation",
                name: "typedoc",
                type: Boolean,
            },
            {
                description: "Execute command after successful build, specially useful for watch mode",
                name: "onSuccess",
                type: String,
            },
            {
                description: "Signal to kill child process, \"SIGTERM\" or \"SIGKILL\"",
                name: "killSignal",
                type: (input: string) => {
                    if (input === "SIGTERM" || input === "SIGKILL") {
                        return input;
                    }

                    throw new Error("Invalid kill signal. Use 'SIGTERM' or 'SIGKILL'.");
                },
            },
            {
                description: "Specify an external dependency, separate by comma (eg. --external lodash,react,react-dom)",
                multiple: true,
                name: "external",
                typeLabel: "string[]",
            },
            {
                description: "do not bundle external dependencies",
                name: "no-external",
                type: Boolean,
            },
            {
                // defaultValue: "browser",
                description: "Specify the build runtime (node, browser).",
                name: "runtime",
                type: (input: string) => {
                    if (input === "node" || input === "browser") {
                        return input;
                    }

                    throw new Error("Invalid runtime. Use 'node' or 'browser'.");
                },
            },
            {
                description: "Enable unbundle mode to preserve source file structure instead of bundling into a single file",
                name: "unbundle",
                type: Boolean,
            },
            {
                description: "Bundle the output into a standalone executable via Node.js SEA (requires Node.js >= 25.7.0, single entry)",
                name: "exe",
                type: Boolean,
            },
        ],
    });
};

export default createBuildCommand;
