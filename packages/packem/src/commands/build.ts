import { env, exit } from "node:process";

import type { Cli } from "@visulima/cerebro";

import { DEVELOPMENT_ENV, PRODUCTION_ENV } from "../constants";
import packem from "../packem";
import type { Environment, Mode } from "../types";

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

            // use the NODE_ENV environment variable if it exists
            if (env.NODE_ENV && [DEVELOPMENT_ENV, PRODUCTION_ENV].includes(env.NODE_ENV)) {
                nodeEnvironment = env.NODE_ENV;
            }

            if (options.env) {
                for (const environment of options.env) {
                    if (environment.key === "NODE_ENV") {
                        if (nodeEnvironment) {
                            throw new Error("NODE_ENV was already set, this can't be overridden.");
                        } else {
                            nodeEnvironment = environment.value;
                        }
                    } else {
                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                        environments["process.env." + environment.key] = JSON.stringify(environment.value);
                    }
                }
            }

            if (nodeEnvironment === undefined) {
                if (options.production) {
                    nodeEnvironment = PRODUCTION_ENV;
                } else if (options.development) {
                    nodeEnvironment = DEVELOPMENT_ENV;
                }
            }

            try {
                await packem(options.dir, mode, nodeEnvironment as Environment, logger, {
                    analyze: options.analyze,
                    cjsInterop: options.cjsInterop,
                    clean: options.clean,
                    configPath: options.config ?? undefined,
                    debug: options.debug,
                    dtsOnly: options.dtsOnly,
                    killSignal: options.killSignal,
                    minify: options.minify === undefined ? nodeEnvironment === PRODUCTION_ENV : options.minify,
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
                    },
                    sourcemap: options.analyze || options.sourcemap,
                    tsconfigPath: options.tsconfig ?? undefined,
                    validation:
                        options.validation === false
                            ? {
                                  packageJson: {
                                      bin: false,
                                      dependencies: false,
                                      exports: false,
                                      files: false,
                                      main: false,
                                      module: false,
                                      name: false,
                                      types: false,
                                      typesVersions: false,
                                  },
                              }
                            : {},
                    ...(options.typedoc
                        ? {
                              typedoc: {
                                  format: "html",
                              },
                          }
                        : {}),
                });
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
                description: "Enable or disable the output validation",
                name: "no-validation",
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
                description: 'Signal to kill child process, "SIGTERM" or "SIGKILL"',
                name: "killSignal",
                type: (input: string) => {
                    if (input === "SIGTERM" || input === "SIGKILL") {
                        return input;
                    }

                    throw new Error("Invalid kill signal. Use 'SIGTERM' or 'SIGKILL'.");
                },
            },
        ],
    });
};

export default createBuildCommand;
