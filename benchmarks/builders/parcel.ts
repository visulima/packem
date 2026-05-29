import { Parcel } from "@parcel/core";
import { writeFile, writeJson } from "@visulima/fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Builder, BuilderOptions } from "./types";

export const parcelBuilder: Builder = {
    name: "parcel",

    async build({ project, entrypoint = "src/index.tsx", outDir = "./builds" }: BuilderOptions) {
        const buildPaths = {
            appEntrypoint: `./projects/${project}/${entrypoint}`,
            appBuild: join(outDir, "build-parcel"),
        };

        await writeFile(`./projects/${project}/.env`, "NODE_ENV=production");

        const configFiles = {
            [`./projects/${project}/.babelrc`]: {
                compact: true,
            },
            [`./projects/${project}/.parcelrc`]: {
                bundler: "@parcel/bundler-default",
                transformers: {
                    "*.{js,jsx,mjs,ts,tsx}": ["@parcel/transformer-babel", "@parcel/transformer-js"],
                    "url:*": ["...", "@parcel/transformer-raw"],
                },
                namers: ["@parcel/namer-default"],
                runtimes: ["@parcel/runtime-js"],
                optimizers: {
                    "*.{js,mjs,cjs}": ["@parcel/optimizer-terser"],
                },
                packagers: {
                    "*.{js,mjs,cjs}": "@parcel/packager-js",
                    "*.ts": "@parcel/packager-ts",
                    "*": "@parcel/packager-raw",
                },
                compressors: {
                    "*": ["@parcel/compressor-raw"],
                },
                resolvers: ["@parcel/resolver-default"],
                reporters: [],
            },
            [`./projects/${project}/.terserrc`]: {
                format: {
                    comments: false,
                },
            },
        };

        for await (const [configFile, contents] of Object.entries(configFiles)) {
            await writeJson(configFile, contents, { indent: 2 });
        }

        const bundler = new Parcel({
            mode: "production",
            entries: buildPaths.appEntrypoint,
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
        await rm(`./projects/${project}/.env`, { force: true });
        await rm(`./projects/${project}/.parcel-cache`, { force: true, recursive: true });
        await rm(`./projects/${project}/.babelrc`, { force: true });
        await rm(`./projects/${project}/.parcelrc`, { force: true });
        await rm(`./projects/${project}/.terserrc`, { force: true });
    },
};
