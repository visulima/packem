import { errorToString, getArguments, getMetrics } from "./utils";
import { existsSync } from "node:fs";
import { bunBuilder } from "../builders/bun";

(async () => {
    try {
        const { project, preset, entrypoint } = getArguments();

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

        await bunBuilder.cleanup?.(options);

        const buildPath = await bunBuilder.build(options);

        await getMetrics(bunBuilder.name, end - start, buildPath, project);

        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
