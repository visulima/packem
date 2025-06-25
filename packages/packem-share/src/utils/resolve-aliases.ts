import type { Alias } from "@rollup/plugin-alias";
import type { PackageJson } from "@visulima/package";

// Note: InternalBuildOptions type will be imported from the consuming packages
// to avoid circular dependencies in the shared package

const resolveAliases = (packageJson: PackageJson, options: any): Record<string, string> => {
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
