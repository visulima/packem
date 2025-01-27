import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { dirname } from "@visulima/path";
import type { Options } from "execa";
import { execaNode } from "execa";

const distributionPath = join(dirname(fileURLToPath(import.meta.url)), "../../dist");

const execPackemSync = async (command: "build" | "init", flags: string[] = [], options: Options = {}) => {
    let environmentFlag: string | undefined = "--development";

    if (flags.includes("--production") || flags.includes("--development") || flags.includes("--no-environment")) {
        environmentFlag = undefined;
    }

    if (flags.includes("--no-environment")) {
        // eslint-disable-next-line no-param-reassign
        flags = flags.filter((flag) => flag !== "--no-environment");
    }

    if (!flags.includes("--validation")) {
        flags.push("--no-validation");
    }

    return await execaNode(join(distributionPath, "cli/index.mjs"), [command, environmentFlag, ...flags].filter(Boolean) as string[], {
        cleanup: true,
        ...options,
    });
};

export default execPackemSync;
