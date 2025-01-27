import { bundle } from "bunchee";
import { errorToString, getArguments, getMetrics } from "./utils";
import { mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import process from "node:process";
import { move } from "@visulima/fs";

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
            appBuild: "./builds/build-bunchee",
            dist: `./projects/${project}/dist`,
        };

        await rm(buildPaths.appBuild, {
            force: true,
            recursive: true,
        });
        await rm(buildPaths.dist, {
            force: true,
            recursive: true,
        });

        const startTime = Date.now();

        const nodeEnvBackup = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        await bundle(buildPaths.appEntrypoint, {
            tsconfig: `./projects/${project}/tsconfig.json`,
            format: "cjs",
            minify: true,
            target: "es2015",
            env: ["NODE_ENV"],
            cwd: `./projects/${project}`,
            external: null,
        });

        process.env.NODE_ENV = nodeEnvBackup;

        // Workaround for bunchee not supporting output directory
        await mkdir(buildPaths.dist, {
            recursive: true,
        });

        for (const files of await readdir(buildPaths.dist, { withFileTypes: true })) {
            if (files.isFile()) {
                await move(`${buildPaths.dist}/${files.name}`, `${buildPaths.appBuild}/${files.name}`);
            }
        }

        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
