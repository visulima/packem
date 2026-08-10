import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { rolldownBuilder } from "../builders/rolldown";
import { errorToString, getArguments, getMetrics } from "./utils";

(async () => {
    try {
        const { entrypoint = "src/index.tsx", project } = getArguments();

        if (!project || !existsSync(`./projects/${project}`)) {
            throw new Error("Invalid project");
        } else if (!existsSync(`./projects/${project}/${entrypoint}`)) {
            throw new Error(`Invalid entrypoint ${entrypoint}`);
        }

        const options = {
            entrypoint,
            project,
        };

        await rolldownBuilder.cleanup?.(options);

        const start = performance.now();
        const buildPath = await rolldownBuilder.build(options);
        const end = performance.now();

        await getMetrics(rolldownBuilder.name, end - start, buildPath, project);
        process.exit(0);
    } catch (error) {
        console.error(errorToString(error));
        process.exit(1);
    }
})();
