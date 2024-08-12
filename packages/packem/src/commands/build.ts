import { env, exit } from "node:process";

import type { Cli } from "@visulima/cerebro";

import { DEVELOPMENT_ENV, PRODUCTION_ENV } from "../constants";
import createBundler from "../create-bundler";
import type { Mode } from "../types";

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

            // use the NODE_ENV environment variable if it exists
            if (env.NODE_ENV && [DEVELOPMENT_ENV, PRODUCTION_ENV].includes(env.NODE_ENV)) {
                environments.NODE_ENV = env.NODE_ENV;
            }

            if (options.env) {
                // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
                for (const environment of options.env) {
                    if (environment.key === "NODE_ENV" && environments.NODE_ENV) {
                        throw new Error("NODE_ENV was already set, this can't be overridden.");
                    }

                    environments[environment.key] = environment.value;
                }
            }

            if (environments.NODE_ENV === undefined) {
                if (options.production) {
                    environments.NODE_ENV = PRODUCTION_ENV;
                } else if (options.development) {
                    environments.NODE_ENV = DEVELOPMENT_ENV;
                } else {
                    environments.NODE_ENV = PRODUCTION_ENV;
                }

                env.NODE_ENV = environments.NODE_ENV;
            }

            try {
                await createBundler(options.dir, mode, logger, {
                    cjsInterop: options.cjsInterop,
                    configPath: options.config ?? undefined,
                    debug: options.debug,
                    minify: options.minify === undefined ? env.NODE_ENV === PRODUCTION_ENV : options.minify,
                    replace: {
                        ...environments,
                    },
                    rollup: {
                        esbuild: {
                            target: options.target,
                        },
                        license: {
                            path: options.license,
                        },
                        metafile: options.metafile,
                        ...(options.analyze ? { visualizer: {} } : { visualizer: false }),
                    },
                    sourcemap: options.sourcemap,
                    tsconfigPath: options.tsconfig ?? undefined,
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
        ],
    });
};

export default createBuildCommand;
