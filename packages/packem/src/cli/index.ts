import Cli from "@visulima/cerebro";
import { SimpleReporter } from "@visulima/pail/reporter";

import { name, version } from "../../package.json";
import createAddCommand from "./commands/add";
import createBuildCommand from "./commands/build";
import createInitCommand from "./commands/init";

/**
 * Attempts to load and enable V8 compile cache for better performance.
 * Falls back to v8-compile-cache module if Node.js native compile cache is not available.
 * @remarks
 * This is a performance optimization that helps reduce startup time by caching
 * compiled JavaScript code.
 */
try {
    // Use node.js 22 new API for better performance.
    // eslint-disable-next-line @typescript-eslint/no-require-imports,global-require
    if (!require("node:module")?.enableCompileCache?.()) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports,global-require
        require("v8-compile-cache");
    }
} catch {
    // We don't have/need to care about v8-compile-cache failed
}

/**
 * Creates and configures the main CLI instance for Packem.
 * Sets up logging, error reporting, and registers available commands.
 * @remarks
 * The CLI is built using the @visulima/cerebro framework and configured with
 * a SimpleReporter for error handling and output formatting.
 * @example
 * ```typescript
 * // The CLI can be used in scripts as follows:
 * import cli from './cli';
 * await cli.run(['build', '--watch']);
 * ```
 */
const index = new Cli("packem", {
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

// Register available commands
createInitCommand(index);
// eslint-disable-next-line etc/no-internal
createBuildCommand(index);
createAddCommand(index);

// Run the CLI without exiting the process
// eslint-disable-next-line no-void
void index.run({
    shouldExitProcess: false,
});
