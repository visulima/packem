import { build } from "esbuild";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

export const esbuildBuilder: Builder = {
    name: "esbuild",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-esbuild"),
        };

        await build({
            entryPoints: [buildPaths.appEntrypoint],
            outdir: buildPaths.appBuild,
            entryNames: "[name]",
            bundle: true,
            minify: true,
            platform: "browser",
            target: ["es2015"],
            jsx: "automatic",
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-esbuild");

        await rm(buildPath, { force: true, recursive: true });
    },
};
