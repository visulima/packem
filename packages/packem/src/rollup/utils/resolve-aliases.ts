import type { Alias } from "@rollup/plugin-alias";
import type { PackageJson } from "@visulima/package";

import type { InternalBuildOptions } from "../../types";

const resolveAliases = (packageJson: PackageJson, options: InternalBuildOptions): Record<string, string> => {
    let aliases: Record<string, string> = {};

    if (packageJson.name) {
        aliases[packageJson.name] = options.rootDir;
    }

    aliases = {
        ...aliases,
        ...options.alias,
    };

    if (options.rollup.alias) {
        if (Array.isArray(options.rollup.alias.entries)) {
            Object.assign(aliases, Object.fromEntries((options.rollup.alias.entries as Alias[]).map((entry: Alias) => [entry.find, entry.replacement])));
        } else {
            Object.assign(aliases, options.rollup.alias.entries ?? options.rollup.alias);
        }
    }

    return aliases;
};

export default resolveAliases;
