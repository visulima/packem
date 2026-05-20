import type { Alias, RollupAliasOptions } from "@rollup/plugin-alias";
import type { PackageJson } from "@visulima/package";

/**
 * Subset of build options that `resolveAliases` consumes. Defined here so the
 * helper can live in `@visulima/packem-rollup` without depending on packem
 * core's `InternalBuildOptions`.
 */
type ResolveAliasesOptions = {
    alias?: Record<string, string>;
    rollup: {
        alias?: RollupAliasOptions | false;
    };
    rootDir: string;
};

const resolveAliases = (packageJson: PackageJson, options: ResolveAliasesOptions): Record<string, string> => {
    let aliases: Record<string, string> = {};

    if (packageJson.name) {
        aliases[packageJson.name] = options.rootDir;
    }

    aliases = {
        ...aliases,
        ...options.alias,
    };

    if (options.rollup.alias && options.rollup.alias.entries) {
        if (Array.isArray(options.rollup.alias.entries)) {
            Object.assign(aliases, Object.fromEntries((options.rollup.alias.entries as Alias[]).map((entry: Alias) => [entry.find, entry.replacement])));
        } else {
            Object.assign(aliases, options.rollup.alias.entries);
        }
    }

    return aliases;
};

export type { ResolveAliasesOptions };
export default resolveAliases;
