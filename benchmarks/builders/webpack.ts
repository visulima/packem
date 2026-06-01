import webpack from "webpack";
import { join, resolve } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

export const webpackBuilder: Builder = {
    name: "webpack",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-webpack"),
        };

        const compiler = webpack({
            entry: buildPaths.appEntrypoint,
            output: {
                path: resolve(buildPaths.appBuild),
                filename: "[name].js",
            },
            mode: "production",
            // Default webpack has no loader for TS/JSX, so a .tsx entry fails to parse.
            // Use swc-loader so the transform matches the rspack builder
            // (builtin:swc-loader) — the comparison then isolates the bundler engine
            // rather than the transformer.
            resolve: {
                extensions: [".js", ".jsx", ".ts", ".tsx"],
            },
            module: {
                rules: [
                    {
                        test: /\.(js|jsx|ts|tsx)$/,
                        exclude: /node_modules/,
                        loader: "swc-loader",
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
        });

        await new Promise((resolve, reject) => {
            compiler.run((err, stats) => {
                if (err) reject(err);
                if (stats?.hasErrors()) reject(stats.toString());
                resolve(stats);
            });
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-webpack");

        await rm(buildPath, { force: true, recursive: true });
    },
};
