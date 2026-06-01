import { Parcel } from "@parcel/core";
import { writeJson } from "@visulima/fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Builder, BuilderOptions } from "./types";

export const parcelBuilder: Builder = {
    name: "parcel",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-parcel"),
        };

        // Parcel locates `.parcelrc` by searching from the *project root* (the
        // nearest lockfile/.git — here the monorepo root) and never descends into
        // projects/<name>/, so a per-project config is never auto-found. Write a
        // minimal config that extends the bundled default pipeline (swc transform +
        // standard packagers — the previous hand-rolled config referenced the
        // uninstalled @parcel/transformer-raw and failed to resolve), and pass its
        // absolute path via `config` so Parcel uses it directly instead of searching.
        // `extends` resolves @parcel/config-default relative to this file's dir,
        // where it is installed.
        const configPath = resolve(`./projects/${project}/.parcelrc`);

        await writeJson(configPath, { extends: "@parcel/config-default" }, { indent: 2 });

        const bundler = new Parcel({
            mode: "production",
            entries: buildPaths.appEntrypoint,
            config: configPath,
            cacheDir: `./projects/${project}/.parcel-cache`,
            targets: {
                default: {
                    distDir: buildPaths.appBuild,
                },
            },
            defaultTargetOptions: {
                shouldOptimize: true,
                shouldScopeHoist: true,
                sourceMaps: false,
            },
        });

        await bundler.run();

        return buildPaths.appBuild;
    },

    async cleanup({ project, outDir = "./builds" }: BuilderOptions) {
        const buildPath = join(outDir, "build-parcel");

        await rm(buildPath, { force: true, recursive: true });
        await rm(`./projects/${project}/.parcel-cache`, { force: true, recursive: true });
        await rm(`./projects/${project}/.parcelrc`, { force: true });
    },
};
