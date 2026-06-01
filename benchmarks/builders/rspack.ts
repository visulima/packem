import { rspack, Compiler } from "@rspack/core";
import { join, resolve } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

const performBuild = (compiler: Compiler) => {
    return new Promise((resolve, reject) => {
        compiler.run((err, stats) => {
            if (err) {
                return reject(err);
            }

            // Mirror the webpack builder: a build that emits errors must not be
            // reported as a successful (and misleadingly fast) run.
            if (stats?.hasErrors()) {
                return reject(stats.toString());
            }

            return resolve(stats);
        });
    });
};

export const rspackBuilder: Builder = {
    name: "rspack",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-rspack"),
        };

        const compiler = rspack({
            mode: "production",
            // Pin an explicit target so rspack doesn't resolve the project's
            // `browserslist` query through browserslist-rs, whose bundled
            // caniuse database is older than the JS browserslist webpack uses and
            // rejects the query ("cannot parse the browserslist query"). The swc
            // loader below already fixes the JS syntax level, so this only sets the
            // output environment.
            target: ["web", "es2015"],
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

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-rspack");

        await rm(buildPath, { force: true, recursive: true });
    },
};
