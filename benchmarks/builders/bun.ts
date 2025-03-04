import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

export const bunBuilder: Builder = {
    name: "bun",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-bun"),
        };

        await Bun.build({
            entrypoints: [buildPaths.appEntrypoint],
            outdir: buildPaths.appBuild,
            naming: "[name].[ext]",
            minify: true,
            define: {
                "process.env.NODE_ENV": JSON.stringify("production"),
            },
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-bun");

        await rm(buildPath, { force: true, recursive: true });
    },
};
