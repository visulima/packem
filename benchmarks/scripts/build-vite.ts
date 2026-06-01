import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { viteBuilder } from "../builders/vite";
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

        await viteBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await viteBuilder.build(options);
        const end = performance.now();

        await getMetrics(viteBuilder.name, end - start, buildPath, project);
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
