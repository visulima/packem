// eslint-disable-next-line import/no-unused-modules,import/no-named-as-default
import Cli from "@visulima/cerebro";
import { SimpleReporter } from "@visulima/pail/reporter";

import { name, version } from "../package.json";
import createAddCommand from "./commands/add";
import createBuildCommand from "./commands/build";
import createInitCommand from "./commands/init";

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
