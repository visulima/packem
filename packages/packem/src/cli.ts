// eslint-disable-next-line import/no-unused-modules,import/no-named-as-default
import Cli from "@visulima/cerebro";
import { SimpleReporter } from "@visulima/pail/reporter";

import { name, version } from "../package.json";
import createBuildCommand from "./commands/build";
import createInitCommand from "./commands/init";

const cli = new Cli("packem", {
    logger: {
        reporters: [new SimpleReporter()],
        scope: "packem",
    },
    packageName: name,
    packageVersion: version,
});

createInitCommand(cli);
createBuildCommand(cli);

// eslint-disable-next-line no-void
void cli.run({
    shouldExitProcess: false,
});
