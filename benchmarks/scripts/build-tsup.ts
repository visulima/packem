import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { tsupBuilder } from "../builders/tsup";
import { performance } from "node:perf_hooks";

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

        const options = {
            project,
            entrypoint,
        };

        await tsupBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await tsupBuilder.build(options);
        const end = performance.now();

        await getMetrics(tsupBuilder.name, end - start, buildPath, project);
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
