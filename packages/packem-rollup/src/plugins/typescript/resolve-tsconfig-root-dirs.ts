import { join, resolve } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { Plugin } from "rollup";

const getRootDirectories = (cwd: string, tsconfig?: TsConfigResult): string[] | undefined => {
    if (!tsconfig) {
        return undefined;
    }

    const { config, path: tsConfigPath } = tsconfig;

    if (!config.compilerOptions) {
        return undefined;
    }

    const { rootDirs } = config.compilerOptions;

    if (!rootDirs) {
        return undefined;
    }

    const mappedRootDirectories: string[] = [];

    for (const rootDirectory of rootDirs) {
        if (rootDirectory.startsWith(".")) {
            throw new Error(`Invalid rootDir value '.' in ${tsConfigPath}.`);
        }

        if (rootDirectory.startsWith("..")) {
            throw new Error(`Invalid rootDir value '..' in ${tsConfigPath}.`);
        }

        mappedRootDirectories.push(resolve(cwd, rootDirectory));
    }

    return mappedRootDirectories;
};

/**
 * This plugin resolves module paths using the rootDirs configuration from the tsconfig.json file.
 *
 * Consider the following example configuration:
 * @example
 * ```json
 * {
 *    "compilerOptions": {
 *        "rootDirs": ["lib"]
 *    }
 * }
 * ```
 *
 * This configuration will allow you to import modules from the `src` and `lib` directories.
 *
 * ```typescript
 * import { foo } from "./foo"; -> ./src/foo
 * import { bar } from "./bar"; // -> ./lib/bar
 * ```
 */
const resolveTsconfigRootDirectories = (cwd: string, logger: Console, tsconfig: TsConfigResult): Plugin => {
    const rootDirectories = getRootDirectories(cwd, tsconfig);

    return {
        name: "packem:resolve-tsconfig-root-dirs",
        async resolveId(id, importer, options) {
            if (rootDirectories === undefined || rootDirectories.length === 0) {
                return undefined;
            }

            if (id.startsWith(".")) {
                for (const rootDirectory of rootDirectories) {
                    const updatedId = join(rootDirectory, id);

                    // eslint-disable-next-line no-await-in-loop
                    const resolved = await this.resolve(updatedId, importer, { skipSelf: true, ...options });

                    if (resolved) {
                        logger.debug({
                            message: `Resolved ${id} to ${resolved.id} using rootDirs from tsconfig.json.`,
                            prefix: "plugin:resolve-tsconfig-root-dirs",
                        });

                        return resolved.id;
                    }
                }
            }

            return undefined;
        },
    };
};

export default resolveTsconfigRootDirectories;
