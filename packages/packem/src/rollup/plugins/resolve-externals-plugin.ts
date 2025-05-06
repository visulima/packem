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
             
            logger.warn(`Ignoring wrong entry type #${index} in '${type}' option: ${JSON.stringify(entry)}`);
        }

        return result;
    }, []);

const calledImplicitExternals = new Map<string, boolean>();

const logExternalMessage = (originalId: string, logger: Pail): void => {
    if (!calledImplicitExternals.has(originalId)) {
        logger.info({
            message: 'Inlined implicit external "' + cyan(originalId) + '". If this is incorrect, add it to the "externals" option.',
            prefix: "plugin:packem:resolve-externals",
        });
    }

    calledImplicitExternals.set(originalId, true);
};

const prefixedBuiltins = new Set(["node:test", "node:sqlite"]);

export type ResolveExternalsPluginOptions = {
    /**
     * Mark node built-in modules like `path`, `fs`... as external.
     *
     * Set the builtins option to false if you'd like to use some shims/polyfills for those.
     *
     * How to handle the node: scheme used in recent versions of Node (i.e., import path from 'node:path').
     * If add (the default, recommended), the node: scheme is always added. In effect, this dedupes your imports of Node builtins by homogenizing their names to their schemed version.
     * If strip, the scheme is always removed. In effect, this dedupes your imports of Node builtins by homogenizing their names to their unschemed version. Schemed-only builtins like node:test are not stripped.
     * ignore will simply leave all builtins imports as written in your code.
     *
     * Note that scheme handling is always applied, regardless of the builtins options being enabled or not.
     *
     * @default true
     */
    builtins?: boolean;
    /**
     * node: prefix handing for importing Node builtins:
     * - `'add'`    turns `'path'` to `'node:path'`
     * - `'strip'`  turns `'node:path'` to `'path'`
     * - `'ignore'` leaves Node builtin names as-is
     *
     * @default "add"
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
    const cachedGlobFiles = new Map<string, string[]>();
    const cacheResolved = new Map<string, boolean>();

    // Map the include and exclude options to arrays of regexes.
    const include = new Set(getRegExps([...buildOptions.externals], "include", logger));
    const exclude = new Set(getRegExps([...(options.exclude ?? [])], "exclude", logger));

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
        // eslint-disable-next-line regexp/no-empty-group
        include.add(new RegExp("^(?:" + names.join("|") + ")(?:/.+)?$"));
    }

    if (packageJson.peerDependenciesMeta) {
        for (const [key, value] of Object.entries(packageJson.peerDependenciesMeta)) {
            if (value?.optional) {
                include.add(new RegExp(`^${key}(?:/.+)?$`));
            }
        }
    }

    const isIncluded = (id: string) => [...include].some((rx) => rx.test(id));
    const isExcluded = (id: string) => [...exclude].some((rx) => rx.test(id));

    let tsconfigPathPatterns: RegExp[] = [];

    if (tsconfig) {
        tsconfigPathPatterns = Object.entries(tsconfig.config.compilerOptions?.paths ?? {}).map(([key]) =>
            (key.endsWith("*") ? new RegExp(`^${key.replace("*", "(.*)")}$`) : new RegExp(`^${key}$`)),
        );
    }

    const resolvedAliases = resolveAliases(packageJson, buildOptions);

    return <Plugin>{
        name: "packem:resolve-externals",
        options: (rollupOptions: InputOptions) => {
            // This function takes an id and returns true (external) or false (not external),
            // eslint-disable-next-line no-param-reassign
            rollupOptions.external = (originalId: string, specifier) => {
                if (cacheResolved.has(originalId)) {
                    return cacheResolved.get(originalId);
                }

                let resolvedId: string | undefined;

                if (Object.keys(resolvedAliases).length > 0) {
                    resolvedId = resolveAlias(originalId, resolvedAliases);

                    if (resolvedId === originalId) {
                        resolvedId = undefined;
                    }
                }

                for (const id of [originalId, resolvedId].filter(Boolean)) {
                    if (
                        /^(?:\0|\.{1,2}\/)/.test(id) || // Ignore virtual modules and relative imports
                        isAbsolute(id) || // Ignore already resolved ids
                        new RegExp(`${buildOptions.sourceDir}[/.*|\\.*]`).test(id) || // Ignore source files
                        (packageJson.name && id.startsWith(packageJson.name)) // Ignore self import
                    ) {
                        cacheResolved.set(id, false);

                        return false;
                    }

                    if (isBuiltin(id) || prefixedBuiltins.has(id)) {
                        let result = options.builtins;

                        if (result === undefined && specifier) {
                            result = isIncluded(specifier) && !isExcluded(specifier);
                        }

                        cacheResolved.set(id, result as boolean);

                        return result;
                    }

                    // package.json imports are not externals
                    // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
                    if (id[0] === "#" && packageJson.imports) {
                        for (const [key, value] of Object.entries(packageJson.imports)) {
                            // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
                            if (key[0] !== "#") {
                                logger.debug({
                                    message: 'Ignoring package.json import "' + cyan(key) + '" because it does not start with "#".',
                                    prefix: "plugin:packem:resolve-externals",
                                });

                                // eslint-disable-next-line no-continue
                                continue;
                            }

                            if (key === id) {
                                cacheResolved.set(id, false);

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
                                        cacheResolved.set(id, false);

                                        return false;
                                    }
                                }
                            }
                        }
                    }

                    if (tsconfigPathPatterns.length > 0) {
                        for (const regexp of tsconfigPathPatterns) {
                            if (regexp.test(id)) {
                                cacheResolved.set(id, false);

                                return false;
                            }
                        }
                    }

                    // Handle npm dependencies.
                    if (isIncluded(id) && !isExcluded(id)) {
                        cacheResolved.set(id, true);

                        return true;
                    }
                }

                logExternalMessage(originalId, logger);

                return false;
            };
        },
        resolveId: {
            async handler(specifier: string, _, { isEntry }): Promise<ResolveIdResult> {
                // Ignore entry points (they should always be resolved)
                if (isEntry) {
                    return null;
                }

                // Handle node builtins.
                if (prefixedBuiltins.has(specifier)) {
                    return {
                        external: true,
                        id: specifier,
                        moduleSideEffects: false,
                    };
                }

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

                return null;
            },
            order: "pre",
        },
    };
};
