import { Parcel } from "@parcel/core";
import { errorToString, getArguments, getMetrics } from "./utils";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeFile, writeJson } from "@visulima/fs";

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
            appBuild: "./builds/build-parcel",
        };

        await rm(buildPaths.appBuild, {
            recursive: true,
            force: true,
        });

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

        const startTime = Date.now();

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

        console.log(getMetrics(startTime, buildPaths.appBuild));

        await rm(`./projects/${project}/.env`, {
            force: true,
        });

        for await (const configFile of Object.keys(configFiles)) {
            await rm(configFile, {
                force: true,
                recursive: true,
            });
        }

        await rm(`./projects/${project}/.parcel-cache`, {
            force: true,
            recursive: true,
        });

        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
