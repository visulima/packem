import Cli from "@visulima/cerebro";

import { name, version } from "../package.json";
import createBuildCommand from "./commands/build";
import createInitCommand from "./commands/init";

const cli = new Cli("packem", {
    packageName: name,
    packageVersion: version,
});

createInitCommand(cli);
createBuildCommand(cli);

// eslint-disable-next-line no-void
void cli.run();
