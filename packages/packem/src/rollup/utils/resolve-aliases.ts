import type { Alias } from "@rollup/plugin-alias";
import type { PackageJson } from "@visulima/package";
import { join } from "@visulima/path";

import type { BuildContext } from "../../types";

const resolveAliases = (context: BuildContext, mode: "build" | "jit" | "types"): Record<string, string> => {
    let aliases: Record<string, string> = {};

    if (context.pkg.name) {
        aliases[context.pkg.name] = context.options.rootDir;
    }

    if (context.pkg.imports) {
        const { imports } = context.pkg;

        for (const alias in imports) {
            if (alias.startsWith("#")) {
                // eslint-disable-next-line no-continue
                continue;
            }

            const subpath = imports[alias as keyof PackageJson["imports"]];

            if (typeof subpath !== "string") {
                // eslint-disable-next-line no-continue
                continue;
            }

            // eslint-disable-next-line security/detect-object-injection
            aliases[alias] = join(context.options.rootDir, subpath);
        }
    }

    aliases = {
        ...aliases,
        ...context.options.alias,
    };

    if (context.options.rollup.alias) {
        if (Array.isArray(context.options.rollup.alias.entries)) {
            Object.assign(
                aliases,
                Object.fromEntries((context.options.rollup.alias.entries as Alias[]).map((entry: Alias) => [entry.find, entry.replacement])),
            );
        } else {
            Object.assign(aliases, context.options.rollup.alias.entries ?? context.options.rollup.alias);
        }
    }

    context.logger.debug({ message: "Resolved aliases: " + JSON.stringify(aliases), prefix: mode });

    return aliases;
};

export default resolveAliases;
