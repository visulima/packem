import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";

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
            appBuild: "./builds/build-bun",
        };

        await rm(buildPaths.appBuild, {
            force: true,
            recursive: true,
        });

        const startTime = Date.now();

        await Bun.build({
            entrypoints: [buildPaths.appEntrypoint],
            outdir: buildPaths.appBuild,
            naming: "[name].[ext]",
            minify: true,
            define: {
                "process.env.NODE_ENV": JSON.stringify("production"),
            },
        });

        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
