import { build as tsdownBuild } from "tsdown";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { Builder, BuilderOptions } from "./types";

export const tsdownBuilder: Builder = {
    name: "tsdown",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-tsdown"),
        };

        await tsdownBuild({
            tsconfig: `./projects/${project}/tsconfig.json`,
            entry: [buildPaths.appEntrypoint],
            outDir: buildPaths.appBuild,
            format: "esm",
            platform: "browser",
            target: "es2015",
            minify: true,
            // Bundle everything (deps included) so the output is comparable to the
            // other builders, and skip declaration emit which they do not produce.
            dts: false,
            clean: false,
            logLevel: "silent",
            env: {
                NODE_ENV: "production",
            },
        });

        return buildPaths.appBuild;
    },

    async cleanup({ outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-tsdown");

        await rm(buildPath, { force: true, recursive: true });
    },
};
