import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { esbuildBuilder } from "../builders/esbuild";
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

        await esbuildBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await esbuildBuilder.build(options);
        const end = performance.now();

        await getMetrics(esbuildBuilder.name, end - start, buildPath, project);

        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
