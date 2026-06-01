import { build as tsupBuild } from "tsup";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

export const tsupBuilder: Builder = {
    name: "tsup",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-tsup"),
        };

        await tsupBuild({
            tsconfig: `./projects/${project}/tsconfig.json`,
            entry: [buildPaths.appEntrypoint],
            outDir: buildPaths.appBuild,
            bundle: true,
            minify: true,
            target: ["es2015"],
            env: {
                NODE_ENV: "production",
            },
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-tsup");

        await rm(buildPath, { force: true, recursive: true });
    },
};
