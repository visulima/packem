import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { packemBuilder } from "../builders/packem";
import { performance } from "node:perf_hooks";

(async () => {
    try {
        const { project, preset = "esbuild", entrypoint = "src/index.tsx" } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (!packemBuilder.supportedPresets?.includes(preset)) {
            throw new Error("Unsupported preset");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const options = {
            project,
            entrypoint,
            preset,
        };

        await packemBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await packemBuilder.build(options);
        const end = performance.now();

        console.log("\n");
        await getMetrics(`${packemBuilder.name}-${preset}`, end - start, buildPath, project);

        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
