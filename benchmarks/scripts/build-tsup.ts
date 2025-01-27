import { build } from "tsup";
import { errorToString, getArguments, getMetrics } from "./utils";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";

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
            appBuild: "./builds/build-esbuild",
        };

        await rm(buildPaths.appBuild, {
            force: true,
            recursive: true,
        });

        const startTime = Date.now();

        await build({
            tsconfig: `./projects/${project}/tsconfig.json`,
            entry: [buildPaths.appEntrypoint],
            outDir: buildPaths.appBuild,
            bundle: true,
            minify: true,
            target: ["es2015"],
            env: {
                NODE_ENV: "production",
            }
        });

        console.log(getMetrics(startTime, buildPaths.appBuild));
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
