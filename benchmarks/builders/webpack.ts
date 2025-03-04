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
