import { dirname, isAbsolute, join, resolve } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { Plugin } from "rollup";

// Relative ids (`./`, `../`) — the only specifiers this resolver rewrites.
const RELATIVE_ID_RE = /^\./;

// A rootDir that is exactly `.` or `..` (optionally with a trailing slash) resolves
// to the tsconfig directory itself or its parent, which is never a meaningful
// `rootDirs` mapping. Anything else (`./lib`, `lib`, `../shared`, `src`) is valid.
const MEANINGLESS_ROOT_DIR_RE = /^\.{1,2}\/?$/;

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

    // tsconfig `rootDirs` are resolved relative to the tsconfig file's own directory,
    // not the process cwd (which may differ when packem runs from a parent dir).
    // When the tsconfig path is itself relative, anchor it on cwd.
    const tsconfigDirectory = dirname(tsConfigPath);
    const baseDirectory = isAbsolute(tsconfigDirectory) ? tsconfigDirectory : resolve(cwd, tsconfigDirectory);

    const mappedRootDirectories: string[] = [];

    for (const rootDirectory of rootDirs) {
        if (MEANINGLESS_ROOT_DIR_RE.test(rootDirectory)) {
            throw new Error(`Invalid rootDir value '${rootDirectory}' in ${tsConfigPath}. Expected a directory path such as "./lib" or "src".`);
        }

        // Relative values (`./lib`, `lib`, `../shared`) resolve against the tsconfig
        // directory; absolute values are used as-is.
        mappedRootDirectories.push(isAbsolute(rootDirectory) ? rootDirectory : resolve(baseDirectory, rootDirectory));
    }

    return mappedRootDirectories;
};

/**
 * Resolves module paths using the `rootDirs` option from `tsconfig.json`.
 *
 * Consider the following example configuration.
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
        resolveId: {
            // Only relative ids (`./`, `../`) are rewritten against rootDirs; a native
            // filter skips every bare/absolute/virtual specifier (forwarded by cachePlugin).
            filter: {
                id: RELATIVE_ID_RE,
            },
            async handler(id, importer, options) {
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
        },
    };
};

export default resolveTsconfigRootDirectories;
