import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { webpackBuilder } from "../builders/webpack";
import { performance } from "node:perf_hooks";

(async () => {
    try {
        const { project, preset = "babel", entrypoint = "src/index.tsx" } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (!webpackBuilder.supportedPresets?.includes(preset)) {
            throw new Error("Unsupported preset");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const options = {
            project,
            entrypoint,
            preset,
        };

        await webpackBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await webpackBuilder.build(options);
        const end = performance.now();

        await getMetrics(`${webpackBuilder.name}-${preset}`, end - start, buildPath, project);
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
