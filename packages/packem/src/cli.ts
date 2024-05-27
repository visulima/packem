import { exit } from "node:process";

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

// eslint-disable-next-line unicorn/prefer-top-level-await,@typescript-eslint/no-explicit-any,etc/no-implicit-any-catch,@typescript-eslint/use-unknown-in-catch-callback-variable
cli.run().catch((error: any) => {
    // eslint-disable-next-line no-console
    console.error(error.message);
    exit(1);
});
