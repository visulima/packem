import { normalizePath } from "@rollup/pluginutils";
import type { Pail } from "@visulima/pail";
import { dirname, resolve } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { Plugin } from "rollup";

type Alias = {
    find: RegExp;
    replacement: string;
};

/** Returns a list of compiled aliases. */
// eslint-disable-next-line sonarjs/cognitive-complexity
export const getConfigAlias = (tsconfig?: TsConfigResult, addBaseUrl = true): Alias[] | null => {
    if (!tsconfig) {
        return null;
    }

    const { config, path: tsConfigPath } = tsconfig;

    if (!config.compilerOptions) {
        return null;
    }

    const { baseUrl, paths } = config.compilerOptions;

    if (!baseUrl) {
        return null;
    }

    // resolve the base url from the configuration file directory
    const resolvedBaseUrl = resolve(dirname(tsConfigPath), baseUrl);

    const aliases: Alias[] = [];

    // compile any alias expressions and push them to the list
    if (paths) {
        for (const [alias, values] of Object.entries(paths)) {
            let find: RegExp;

            // eslint-disable-next-line unicorn/prefer-ternary
            if (alias === "@" || alias === "~" || alias === "#") {
                // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
                find = new RegExp(`^${alias}/(.+)$`);
            } else {
                /** Regular Expression used to match a given path. */
                // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
                find = new RegExp(`^${[...alias].map((segment) => (segment === "*" ? "(.+)" : segment.replace(/[\\^$*+?.()|[\]{}]/, "\\$&"))).join("")}$`);
            }

            /** Internal index used to calculate the matching id in a replacement. */
            let matchId = 0;

            for (const value of values) {
                /** String used to replace a matched path. */
                const replacement = [...normalizePath(resolve(resolvedBaseUrl, value))]
                    // eslint-disable-next-line @typescript-eslint/no-loop-func,no-plusplus,@typescript-eslint/restrict-plus-operands
                    .map((segment) => (segment === "*" ? "$" + (++matchId + "") : segment === "$" ? "$$" : segment))
                    .join("");

                aliases.push({ find, replacement });
            }
        }
    }

    if (addBaseUrl) {
        // compile the baseUrl expression and push it to the list
        // - `baseUrl` changes the way non-relative specifiers are resolved
        // - if `baseUrl` exists then all non-relative specifiers are resolved relative to it
        aliases.push({
            find: /^(?!\.*\/|\.*$|\w:)(.+)$/,

            replacement: `${[...normalizePath(resolvedBaseUrl)].map((segment) => (segment === "$" ? "$$" : segment)).join("")}/$1`,
        });
    }

    return aliases;
};

/**
 * This adds aliasing support to Rollup from tsconfig.json or jsconfig.json files.
 *
 * Consider the following example configuration:
 *
 * @example
 * {
 *     "compilerOptions": {
 *         "baseUrl": "src",
 *         "paths": {
 *             "components:*": ["components/*.ts"]
 *         }
 *     }
 * }
 *
 * With this configuration, the following imports would map to the same location.
 *
 * @example
 *
 * import Test from '../components/Test.ts';
 *
 * import Test from 'components/Test.ts';
 *
 * import Test from 'components:Test';
 */
export const resolveTsconfigPaths = (tsconfig: TsConfigResult, logger: Pail): Plugin => {
    const configAlias = getConfigAlias(tsconfig);

    return {
        name: "packem:resolve-tsconfig-paths",
        async resolveId(id, importer, options) {
            if (!configAlias || id.includes("\0")) {
                return null;
            }

            // Handle aliases found from `compilerOptions.paths`. Unlike @rollup/plugin-alias, tsconfig aliases
            // are the best effort only, so we have to manually replace them here, instead of using `alias` or `rollup.alias`

            for (const { find, replacement } of configAlias) {
                if (find.test(id)) {
                    const updatedId = id.replace(find, replacement);
                    // eslint-disable-next-line no-await-in-loop
                    const resolved = await this.resolve(updatedId, importer, { skipSelf: true, ...options });

                    if (resolved) {
                        logger.debug({
                            message: `Resolved ${id} to ${resolved.id} using paths from tsconfig.json.`,
                            prefix: "plugin:resolve-tsconfig-paths",
                        });

                        return resolved.id;
                    }
                }
            }

            return null;
        },
    };
};
