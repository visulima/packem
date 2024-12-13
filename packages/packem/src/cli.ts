// eslint-disable-next-line import/no-unused-modules,import/no-named-as-default
import Cli from "@visulima/cerebro";
import { SimpleReporter } from "@visulima/pail/reporter";

import { name, version } from "../package.json";
import createAddCommand from "./commands/add";
import createBuildCommand from "./commands/build";
import createInitCommand from "./commands/init";

// We need to load v8-compile-cache.js separately in order to have effect
try {
    // Use node.js 22 new API for better performance.
    // eslint-disable-next-line @typescript-eslint/no-require-imports,global-require,unicorn/prefer-module
    if (!require("node:module")?.enableCompileCache?.()) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports,global-require,unicorn/prefer-module
        require("v8-compile-cache");
    }
} catch {
    // We don't have/need to care about v8-compile-cache failed
}

/**
 * Create a new instance of the packem CLI.
 *
 * @type {Cli}
 */
const cli = new Cli("packem", {
    logger: {
        reporters: [
            new SimpleReporter({
                error: {
                    hideErrorCauseCodeView: true,
                    hideErrorCodeView: true,
                    hideErrorErrorsCodeView: true,
                },
            }),
        ],
        scope: "packem",
    },
    packageName: name,
    packageVersion: version,
});

createInitCommand(cli);
createBuildCommand(cli);
createAddCommand(cli);

// eslint-disable-next-line no-void
void cli.run({
    shouldExitProcess: false,
});
