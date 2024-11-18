import { readdirSync } from "node:fs";
import { isBuiltin } from "node:module";

import { cyan } from "@visulima/colorize";
import type { PackageJson } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import { isAbsolute, join } from "@visulima/path";
import { resolveAlias } from "@visulima/path/utils";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { InputOptions, Plugin, ResolveIdResult } from "rollup";

import { ENDING_RE } from "../../constants";
import type { InternalBuildOptions } from "../../types";
import arrayIncludes from "../../utils/array-includes";
import getPackageName from "../../utils/get-package-name";
import resolveAliases from "../utils/resolve-aliases";

type MaybeFalsy<T> = T | undefined | null | false;

const getRegExps = (data: MaybeFalsy<string | RegExp>[], type: "include" | "exclude", logger: Pail): RegExp[] =>
    // eslint-disable-next-line unicorn/no-array-reduce
    data.reduce<RegExp[]>((result, entry, index) => {
        if (entry instanceof RegExp) {
            result.push(entry);
        } else if (typeof entry === "string" && entry.length > 0) {
            result.push(new RegExp("^" + entry.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
        } else {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            logger.warn(`Ignoring wrong entry type #${index} in '${type}' option: ${JSON.stringify(entry)}`);
        }

        return result;
    }, []);

const calledImplicitExternals = new Map<string, boolean>();
const cachedGlobFiles = new Map<string, string[]>();

export type ResolveExternalsPluginOptions = {
    /**
     * Mark node built-in modules like `path`, `fs`... as external.
     *
     * Defaults to `true`.
     */
    builtins?: boolean;
    /**
     * node: prefix handing for importing Node builtins:
     * - `'add'`    turns `'path'` to `'node:path'`
     * - `'strip'`  turns `'node:path'` to `'path'`
     * - `'ignore'` leaves Node builtin names as-is
     *
     * Defaults to `add`.
     */
    builtinsPrefix?: "add" | "strip" | "ignore";
    /**
     * Mark dependencies as external.
     *
     * Defaults to `true`.
     */
    deps?: boolean;
    /**
     * Mark devDependencies as external.
     *
     * Defaults to `false`.
     */
    devDeps?: boolean;
    /**
     * Force exclude these deps from the list of externals, regardless of other settings.
     *
     * Defaults to `[]` (force exclude nothing).
     */
    exclude?: MaybeFalsy<string | RegExp>[];
    /**
     * Force include these deps in the list of externals, regardless of other settings.
     *
     * Defaults to `[]` (force include nothing).
     */
    include?: MaybeFalsy<string | RegExp>[];
    /**
     * Mark optionalDependencies as external.
     *
     * Defaults to `true`.
     */
    optDeps?: boolean;
    /**
     * Mark peerDependencies as external.
     *
     * Defaults to `true`.
     */
    peerDeps?: boolean;
};

export const resolveExternalsPlugin = (
    packageJson: PackageJson,
    tsconfig: TsConfigResult | undefined,
    buildOptions: InternalBuildOptions,
    logger: Pail,
    options: ResolveExternalsPluginOptions,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Plugin => {
    // Map the include and exclude options to arrays of regexes.
    const include = getRegExps([...(options.include ?? [])], "include", logger);
    const exclude = getRegExps([...(options.exclude ?? [])], "exclude", logger);

    const dependencies: Record<string, string> = {};

    Object.assign(
        dependencies,
        options.deps ? packageJson.dependencies : undefined,
        options.devDeps ? packageJson.devDependencies : undefined,
        options.peerDeps ? packageJson.peerDependencies : undefined,
        options.optDeps ? packageJson.optionalDependencies : undefined,
    );

    // Add all dependencies as an include RegEx.
    const names = Object.keys(dependencies);

    if (names.length > 0) {
        include.push(new RegExp("^(?:" + names.join("|") + ")(?:/.+)?$"));
    }

    const isIncluded = (id: string) => include.some((rx) => rx.test(id));
    const isExcluded = (id: string) => exclude.some((rx) => rx.test(id));

    let transformedTsconfigPaths: RegExp[] = [];

    if (tsconfig) {
        transformedTsconfigPaths = Object.entries(tsconfig.config.compilerOptions?.paths ?? {}).map((path) =>
            (path[0].endsWith("*") ? new RegExp(`^${path[0].replace("*", "(.*)")}$`) : new RegExp(`^${path[0]}$`)),
        );
    }

    const resolvedAliases = resolveAliases(packageJson, buildOptions);

    return <Plugin>{
        name: "packem:resolve-externals",
        options: (rollupOptions: InputOptions) => {
            // eslint-disable-next-line no-param-reassign
            rollupOptions.external = (id: string) => {
                if (
                    /^(?:\0|\.{1,2}\/)/.test(id) || // Ignore virtual modules and relative imports
                    isAbsolute(id) || // Ignore already resolved ids
                    (packageJson.name && id.startsWith(packageJson.name)) // Ignore self import
                ) {
                    return false;
                }

                if (isBuiltin(id)) {
                    return false;
                }

                // Handle npm dependencies.
                if (isIncluded(id) && !isExcluded(id)) {
                    return false;
                }

                if (arrayIncludes(buildOptions.externals, getPackageName(id)) || arrayIncludes(buildOptions.externals, id)) {
                    return true;
                }

                // package.json imports are not externals
                if (packageJson.imports) {
                    for (const [key, value] of Object.entries(packageJson.imports)) {
                        if (key === id) {
                            return false;
                        }

                        // if a glob is used, we need to check if the id matches the files in the source directory
                        if (key.includes("*")) {
                            let files: string[];

                            if (cachedGlobFiles.has(key)) {
                                files = cachedGlobFiles.get(key) as string[];
                            } else {
                                // eslint-disable-next-line security/detect-non-literal-fs-filename
                                files = readdirSync(join(buildOptions.rootDir, (value as string).replace("/*", "")), { withFileTypes: true })
                                    .filter((dirent) => dirent.isFile())
                                    .map((dirent) => dirent.name);

                                cachedGlobFiles.set(key, files);
                            }

                            for (const file of files) {
                                if (file.replace(ENDING_RE, "") === id.replace(ENDING_RE, "").replace("#", "")) {
                                    return false;
                                }
                            }
                        }
                    }
                }

                if (transformedTsconfigPaths.length > 0) {
                    for (const regexp of transformedTsconfigPaths) {
                        if (regexp.test(id)) {
                            return false;
                        }
                    }
                }

                if (Object.keys(resolvedAliases).length > 0 && resolveAlias(id, resolvedAliases) !== id) {
                    return false;
                }

                if (!calledImplicitExternals.has(id)) {
                    logger.info({
                        message: 'Inlined implicit external "' + cyan(id) + '". If this is incorrect, add it to the "externals" option.',
                        prefix: "plugin:packem:resolve-externals",
                    });
                }

                calledImplicitExternals.set(id, true);

                return false;
            };
        },
        resolveId: {
            async handler(specifier: string, _, { isEntry }): Promise<ResolveIdResult> {
                if (
                    isEntry || // Ignore entry points (they should always be resolved)
                    /^(?:\0|\.{1,2}\/)/.test(specifier) || // Ignore virtual modules and relative imports
                    isAbsolute(specifier) || // Ignore already resolved ids
                    (packageJson.name && specifier.startsWith(packageJson.name)) // Ignore self import
                ) {
                    return null;
                }

                // Handle node builtins.
                if (isBuiltin(specifier)) {
                    const stripped = specifier.replace(/^node:/, "");

                    return {
                        external: (options.builtins || isIncluded(specifier)) && !isExcluded(specifier),
                        id:
                            options.builtinsPrefix === "ignore"
                                ? specifier
                                : options.builtinsPrefix === "add" || !isBuiltin(stripped)
                                  ? "node:" + stripped
                                  : stripped,
                        moduleSideEffects: false,
                    };
                }

                // Handle npm dependencies.
                if (isIncluded(specifier) && !isExcluded(specifier)) {
                    return false;
                }

                // // eslint-disable-next-line no-param-reassign
                // id = resolveAlias(id, resolvedAliases);
                //
                // // eslint-disable-next-line @typescript-eslint/naming-convention
                // const package_ = getPackageName(id);
                //
                // if (arrayIncludes(buildOptions.externals, package_) || arrayIncludes(buildOptions.externals, id)) {
                //     return id;
                // }
                //
                // if (id.startsWith(".") || isAbsolute(id) || /src[/\\]/.test(id) || (packageJson.name && id.startsWith(packageJson.name))) {
                //     return id;
                // }

                // // if (pathsKeys.length > 0) {
                // //     return null
                // // return await resolvePathsToIds(
                // //     paths,
                // //     pathsKeys,
                // //     resolvedBaseUrl,
                // //     id,
                // //     async (candidate) => {
                // //         try {
                // //             const resolved = await this.resolve(candidate, importer, { skipSelf: true, ...options });
                // //
                // //             if (resolved) {
                // //                 context.logger.debug({
                // //                     message: `Resolved alias ${id} to ${resolved}`,
                // //                     prefix: type,
                // //                 });
                // //                 return resolved;
                // //             }
                // //         } catch (error) {
                // //             logger.debug({
                // //                 context: error,
                // //                 message: `Failed to resolve ${candidate} from ${id as string}`,
                // //                 prefix: "plugin:packem:resolve-tsconfig-paths",
                // //             });
                // //         }
                // //
                // //         return null;
                // //     },
                // //     logger,
                // // );
                // // }
                //
                // if (!calledImplicitExternals.has(id)) {
                //     // logger.info({
                //     //     message: 'Inlined implicit external "' + cyan(id) + '". If this is incorrect, add it to the "externals" option.',
                //     //     prefix: type,
                //     // });
                // }
                //
                // calledImplicitExternals.set(id, true);
                //
                // return id;

                return null;
            },
            order: "pre",
        },
    };
};
