import { createCerebro } from "@visulima/cerebro";
import createPailLogger from "@visulima/cerebro/logger/pail";
import type { Pail } from "@visulima/pail";
import { SimpleReporter } from "@visulima/pail/reporter/simple";

import { name, version } from "../../package.json";
import createAddCommand from "./commands/add";
import createBuildCommand from "./commands/build";
import createInitCommand from "./commands/init";
import createMigrateCommand from "./commands/migrate";

/**
 * Enables the V8 compile cache for faster startup.
 * @remarks
 * Uses Node.js' native `module.enableCompileCache` (always present given the
 * package's supported engines: Node 22.23+/24.10+). Failures are non-fatal.
 */
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports,global-require
    const nodeModule = require("node:module") as { enableCompileCache?: () => unknown };

    nodeModule.enableCompileCache?.();
} catch {
    // Enabling the compile cache is a best-effort optimization; ignore failures.
}

/**
 * Creates and configures the main CLI instance for Packem.
 * Sets up logging, error reporting, and registers available commands.
 * @remarks
 * The CLI is built using the `@visulima/cerebro` framework and configured with
 * a SimpleReporter for error handling and output formatting.
 * @example
 * ```typescript
 * // The CLI can be used in scripts as follows:
 * import cli from './cli';
 * await cli.run(['build', '--watch']);
 * ```
 */
const index = createCerebro<Pail>("packem", {
    // `createPailLogger` returns @visulima/cerebro's bundled copy of `PailServerType`,
    // which is structurally identical to `@visulima/pail`'s `Pail` but a distinct
    // declaration. Their self-referential `new (...)` constructor signature defeats
    // structural assignability between the two copies, so bridge them here.
    logger: createPailLogger({
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
    }) as unknown as Pail,
    packageName: name,
    packageVersion: version,
});

// Register available commands
createInitCommand(index);
createBuildCommand(index);
createAddCommand(index);
createMigrateCommand(index);

// Run the CLI without exiting the process
// eslint-disable-next-line no-void
void index.run({
    shouldExitProcess: false,
});
