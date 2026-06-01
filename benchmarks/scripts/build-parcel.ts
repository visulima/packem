import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { parcelBuilder } from "../builders/parcel";

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

        await parcelBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await parcelBuilder.build(options);
        const end = performance.now();

        await getMetrics(parcelBuilder.name, end - start, buildPath, project);
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
