import { cwd, exit } from "node:process";

import type { Cli } from "@visulima/cerebro";
import {
    DEVELOPMENT_ENV,
    PRODUCTION_ENV,
} from "@visulima/packem-share/constants";
import { resolve } from "@visulima/path";
import { defu } from "defu";
import { createJiti } from "jiti";

import loadPackemConfig from "../../config/utils/load-packem-config";
import loadPreset from "../../config/utils/load-preset";
import packem from "../../packem";
import type { BuildConfig, Environment, Mode } from "../../types";

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
const createBuildCommand = (cli: Cli): void => {
    cli.addCommand({
        description: "Demonstrate options required",
        // eslint-disable-next-line sonarjs/cognitive-complexity
        execute: async ({ logger, options }): Promise<void> => {
            let mode: Mode = "build";

            if (options.watch) {
                mode = "watch";
            } else if (options.jit) {
                mode = "jit";
            }

            const environments: Record<string, string> = {};
            let nodeEnvironment: string | undefined;

            // Process environment variables
            if (options.env) {
                for (const environment of options.env) {
                    if (environment.key === "NODE_ENV") {
                        nodeEnvironment = environment.value;
                    } else {
                        environments[`process.env.${environment.key}`]
                            = JSON.stringify(environment.value);
                    }
                }
            }

            // Determine NODE_ENV if not explicitly set
            if (nodeEnvironment === undefined) {
                if (options.production) {
                    nodeEnvironment = PRODUCTION_ENV;
                } else if (options.development) {
                    nodeEnvironment = DEVELOPMENT_ENV;
                }
            }

            const externals: string[] = [];

            // Process external dependencies
            if (options.external) {
                for (const extension of options.external) {
                    externals.push(extension.split(","));
                }
            }

            const rootPath = resolve(cwd(), options.dir ?? ".");

            const jiti = createJiti(rootPath, { debug: options.debug });
            const { config: buildConfig, path: buildConfigPath }
                = await loadPackemConfig(
                    jiti,
                    rootPath,
                    nodeEnvironment as Environment,
                    mode,
                    options.config ?? undefined,
                );

            logger.debug("Using packem config found at", buildConfigPath);

            const preset = await loadPreset(buildConfig.preset ?? "auto", jiti);

            // When minify is enabled, sourcemap should be enabled by default, unless explicitly opted out
            if (options.minify && options.sourcemap === undefined) {
                // eslint-disable-next-line no-param-reassign
                options.sourcemap = true;
            }

            try {
                await packem(
                    rootPath,
                    mode,
                    nodeEnvironment as Environment,
                    logger,
                    options.debug,
                    defu<BuildConfig, BuildConfig[]>(buildConfig, preset, {
                        analyze: options.analyze,
                        cjsInterop: options.cjsInterop,
                        clean: options.clean,
                        dtsOnly: options.dtsOnly,
                        externals,
                        killSignal: options.killSignal,
                        minify:
                            options.minify === undefined
                                ? nodeEnvironment === PRODUCTION_ENV
                                : options.minify,
                        onSuccess: options.onSuccess,
                        rollup: {
                            esbuild: {
                                target: options.target,
                            },
                            license: {
                                path: options.license,
                            },
                            metafile: options.metafile,
                            replace: {
                                values: environments,
                            },
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
                        sourcemap:
                            options.metafile
                            || options.analyze
                            || options.sourcemap,
                        // validation will take the default values
                        validation: options.validation === false ? false : {},
                        ...options.typedoc
                            ? {
                                typedoc: {
                                    format: "html",
                                },
                            }
                            : {},
                    }),
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
                defaultValue: ".",
                description: "The directory to build",
                name: "dir",
                type: String,
            },
            {
                alias: "t",
                description:
                    "Environments to support. `target` in tsconfig.json is automatically added. Defaults to the current Node.js version.",
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
                description:
                    "Compile-time environment variables (eg. --env.NODE_ENV=production)",
                multiple: true,
                name: "env",
                type: (input: string) => {
                    const [key, value] = input.split("=");

                    return {
                        key,
                        value,
                    };
                },
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
                description:
                    "CJS interop mode, can export default and named export, (experimental).",
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
                description:
                    "Execute command after successful build, specially useful for watch mode",
                name: "onSuccess",
                type: String,
            },
            {
                description:
                    "Signal to kill child process, \"SIGTERM\" or \"SIGKILL\"",
                name: "killSignal",
                type: (input: string) => {
                    if (input === "SIGTERM" || input === "SIGKILL") {
                        return input;
                    }

                    throw new Error(
                        "Invalid kill signal. Use 'SIGTERM' or 'SIGKILL'.",
                    );
                },
            },
            {
                description:
                    "Specify an external dependency, separate by comma (eg. --external lodash,react,react-dom)",
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
                description: "Specify the build runtime (nodejs, browser).",
                name: "runtime",
                type: (input: string) => {
                    if (input === "node" || input === "browser") {
                        return input;
                    }

                    throw new Error(
                        "Invalid runtime. Use 'node' or 'browser'.",
                    );
                },
            },
        ],
    });
};

export default createBuildCommand;
