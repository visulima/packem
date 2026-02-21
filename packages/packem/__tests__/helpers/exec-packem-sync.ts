import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { dirname } from "@visulima/path";
import type { Options } from "execa";
import { execaNode } from "execa";

const distributionPath = join(dirname(fileURLToPath(import.meta.url)), "../../dist");

const execPackem = async (command: "build" | "init" | "migrate", flags: string[] = [], options: Options = {}) => {
    let environmentFlag: string | undefined = "--development";

    if (command !== "build" || flags.includes("--production") || flags.includes("--development") || flags.includes("--no-environment")) {
        environmentFlag = undefined;
    }

    if (command === "build" && flags.includes("--no-environment")) {
        // eslint-disable-next-line no-param-reassign
        flags = flags.filter((flag) => flag !== "--no-environment");
    }

    // Only add --no-validation for build command, as migrate and init don't support it
    if (command === "build" && !flags.includes("--validation")) {
        flags.push("--no-validation");
    }

    return await execaNode(join(distributionPath, "cli/index.js"), [command, environmentFlag, ...flags].filter(Boolean) as string[], {
        cleanup: true,
        ...options,
        env: {
            ...(options.env as Record<string, string> | undefined),
            // Prevent the pail logger from line-wrapping output in subprocess tests.
            // Without a TTY, pail defaults to 80 columns which breaks assertions
            // that check for full log messages longer than 80 characters.
            COLUMNS: "10000",
            LINES: "1000",
        },
    });
};

export default execPackem;
