import { rspack, Compiler } from "@rspack/core";
import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const performBuild = (compiler: Compiler) => {
    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err) {
                return reject(err);
            }

            return resolve(stats);
        });
    });
};

(async () => {
    try {
        const { project, preset, entrypoint = "src/index.tsx" } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (preset) {
            throw new Error("Presets aren't supported");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: "./builds/build-rspack",
        };

        await rm(buildPaths.appBuild, {
            recursive: true,
            force: true,
        });

        const startTime = Date.now();

        const compiler = rspack({
            mode: "production",
            entry: {
                index: buildPaths.appEntrypoint,
            },
            output: {
                path: resolve(buildPaths.appBuild),
                filename: "[name].js",
            },
            resolve: {
                modules: ["node_modules"],
                extensions: [".js", ".jsx", ".ts", ".tsx"],
            },
            module: {
                rules: [
                    {
                        test: /\.(js|jsx|ts|tsx)$/,
                        exclude: /node_modules/,
                        loader: "builtin:swc-loader",
                        options: {
                            jsc: {
                                target: "es2015",
                                parser: {
                                    syntax: "typescript",
                                    tsx: true,
                                },
                                transform: {
                                    react: {
                                        runtime: "automatic",
                                    },
                                },
                            },
                        },
                    },
                ],
            },
            optimization: {
                minimize: true,
                minimizer: [new rspack.SwcJsMinimizerRspackPlugin()],
            },
        });

        await performBuild(compiler);

        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
