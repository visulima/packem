import { cyan } from "@visulima/colorize";
import type { BuildContext } from "@visulima/packem-share/types";
import { getPackageName } from "@visulima/packem-share/utils";
import type { Pail } from "@visulima/pail";
import { isAbsolute } from "@visulima/path";
import { resolveAlias } from "@visulima/path/utils";
import { isNodeBuiltin, parseNodeModulePath } from "mlly";
import type { InputOptions, Plugin, ResolveIdResult } from "rollup";

import type { InternalBuildOptions } from "../../types";
import { isFromNodeModules } from "../../utils/import-specifier.js";
import resolveAliases from "../utils/resolve-aliases";

type MaybeFalsy<T> = T | false | null | undefined;

const getRegExps = (data: MaybeFalsy<RegExp | string>[], type: "exclude" | "include", logger: Pail): RegExp[] =>
    // eslint-disable-next-line unicorn/no-array-reduce
    data.reduce<RegExp[]>((result, entry, index) => {
        if (entry instanceof RegExp) {
            result.push(entry);
        } else if (typeof entry === "string" && entry.length > 0) {
            result.push(new RegExp(`^${entry.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}$`));
        } else {
            logger.warn(`Ignoring wrong entry type #${index} in '${type}' option: ${JSON.stringify(entry)}`);
        }

        return result;
    }, []);

const calledImplicitExternals = new Map<string, boolean>();

const logExternalMessage = (originalId: string, logger: Pail): void => {
    if (!calledImplicitExternals.has(originalId)) {
        logger.info({
            message: `Inlined implicit external "${cyan(originalId)}". If this is incorrect, add it to the "externals" option.`,
            prefix: "plugin:packem:resolve-externals",
        });
    }

    calledImplicitExternals.set(originalId, true);
};

const prefixedBuiltins = new Set(["node:sqlite", "node:test"]);

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
     * @default true
     */
    builtins?: boolean;

    /**
     * node: prefix handing for importing Node builtins:
     * - `'add'`    turns `'path'` to `'node:path'`
     * - `'strip'`  turns `'node:path'` to `'path'`
     * - `'ignore'` leaves Node builtin names as-is
     * @default "add"
     */
    builtinsPrefix?: "add" | "ignore" | "strip";

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
    exclude?: MaybeFalsy<RegExp | string>[];

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

export const resolveExternalsPlugin = (context: BuildContext<InternalBuildOptions>): Plugin => {
    const cacheResolved = new Map<string, boolean>();
    const resolvedExternalsOptions = context.options?.rollup?.resolveExternals ?? {};

    // Map the include and exclude options to arrays of regexes.
    const include = new Set(getRegExps([...(context.options?.externals ?? [])], "include", context.logger));
    const exclude = new Set(getRegExps([...(resolvedExternalsOptions.exclude ?? [])], "exclude", context.logger));

    const dependencies: Record<string, string> = {
        ...(resolvedExternalsOptions.deps ? (context.pkg.dependencies ?? {}) : undefined),
        ...(resolvedExternalsOptions.devDeps ? (context.pkg.devDependencies ?? {}) : undefined),
        ...(resolvedExternalsOptions.peerDeps ? (context.pkg.peerDependencies ?? {}) : undefined),
        ...(resolvedExternalsOptions.optDeps ? (context.pkg.optionalDependencies ?? {}) : undefined),
    };

    // Add all dependencies as an include RegEx.
    const names = Object.keys(dependencies);

    if (names.length > 0) {
        include.add(new RegExp(`^(?:${names.join("|")})(?:/.+)?$`));
    }

    if (context.pkg?.peerDependenciesMeta) {
        for (const [key, value] of Object.entries(context.pkg.peerDependenciesMeta)) {
            if (value && typeof value === "object" && "optional" in value && value.optional) {
                include.add(new RegExp(`^${key}(?:/.+)?$`));
            }
        }
    }

    const isIncluded = (id: string) => [...include].some((rx) => rx.test(id));
    const isExcluded = (id: string) => [...exclude].some((rx) => rx.test(id));

    let tsconfigPathPatterns: RegExp[] = [];

    if (context.tsconfig) {
        tsconfigPathPatterns = Object.entries(context.tsconfig.config.compilerOptions?.paths ?? {}).map(([key]) =>
            key.endsWith("*") ? new RegExp(`^${key.replace("*", "(.*)")}$`) : new RegExp(`^${key}$`),
        );
    }

    const resolvedAliases = resolveAliases(context.pkg, context.options);

    return <Plugin>{
        name: "packem:resolve-externals",
        options: (rollupOptions: InputOptions) => {
            // This function takes an id and returns true (external) or false (not external),
            // eslint-disable-next-line no-param-reassign, sonarjs/cognitive-complexity
            rollupOptions.external = (originalId: string, importer) => {
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

                // Try to guess package name of id
                const packageName =
                    (resolvedId && parseNodeModulePath(resolvedId)?.name) || parseNodeModulePath(originalId)?.name || getPackageName(originalId);

                if (packageName && !packageName.startsWith(".") && !isNodeBuiltin(packageName)) {
                    context.usedDependencies.add(packageName);

                    if (
                        // Only treat as hoisted if the importer is source
                        (!importer || !importer.includes("/node_modules/")) &&
                        !Object.keys(context.pkg.dependencies ?? {}).includes(packageName) &&
                        !Object.keys(context.pkg.devDependencies ?? {}).includes(packageName) &&
                        !Object.keys(context.pkg.peerDependencies ?? {}).includes(packageName) &&
                        !Object.keys(context.pkg.optionalDependencies ?? {}).includes(packageName) &&
                        context.options.validation &&
                        context.options.validation.dependencies !== false &&
                        context.options.validation.dependencies.hoisted !== false &&
                        !context.options.validation.dependencies.hoisted?.exclude.includes(packageName)
                    ) {
                        context.hoistedDependencies.add(packageName);
                    }
                }

                for (const id of [originalId, resolvedId].filter(Boolean)) {
                    if (
                        /^(?:\0|\.{1,2}\/)/.test(id) || // Ignore virtual modules and relative imports
                        isAbsolute(id) || // Ignore already resolved ids
                        new RegExp(String.raw`${context.options?.sourceDir}[/.*|\.*]`).test(id) || // Ignore source files
                        (context.pkg.name && id.startsWith(context.pkg.name)) // Ignore self import
                    ) {
                        cacheResolved.set(id, false);

                        return false;
                    }

                    if (isNodeBuiltin(id) || prefixedBuiltins.has(id)) {
                        let result = resolvedExternalsOptions.builtins;

                        if (result === undefined && importer) {
                            result = isIncluded(importer) && !isExcluded(importer);
                        }

                        cacheResolved.set(id, result as boolean);

                        return result;
                    }

                    // package.json imports (# imports) are handled by resolveId hook
                    // Skip them here to avoid conflicts - resolveId hook externalizes them from source
                    if (id[0] === "#" && !id.startsWith("#/")) {
                        // Let resolveId hook handle # imports
                        cacheResolved.set(id, false);

                        return false;
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

                context.implicitDependencies.add(originalId);

                logExternalMessage(originalId, context.logger);

                return false;
            };
        },
        resolveId: {
            filter: {
                // Process potential builtins and # imports - skip virtual modules, relative imports, and absolute paths
                id: (id: string) => {
                    // Skip virtual modules (starting with \0)
                    if (id.startsWith("\0")) {
                        return false;
                    }

                    // Skip relative imports
                    if (id.startsWith("./") || id.startsWith("../")) {
                        return false;
                    }

                    // Skip absolute paths
                    if (isAbsolute(id)) {
                        return false;
                    }

                    // Process # imports (package.json imports) and everything else (potential builtins or package names)
                    return true;
                },
            },
            async handler(specifier: string, importer, { isEntry }): Promise<ResolveIdResult> {
                // Ignore entry points (they should always be resolved)
                if (isEntry) {
                    return undefined;
                }

                // Handle package.json imports (# imports) - externalize from source, not from node_modules
                // #/ patterns are typically tsconfig path aliases, not package.json imports
                if (specifier[0] === "#" && !specifier.startsWith("#/") && context.pkg.imports) {
                    if (importer && !isFromNodeModules(importer, context.options.rootDir)) {
                        // Import is from current package source, externalize it
                        // This allows Node.js to resolve it at runtime using package.json#imports
                        return {
                            external: true,
                            id: specifier,
                        };
                    }

                    // If from node_modules, let Node-resolver handle it
                    return undefined;
                }

                // Handle node builtins.
                if (prefixedBuiltins.has(specifier)) {
                    return {
                        external: true,
                        id: specifier,
                        moduleSideEffects: false,
                    };
                }

                if (isNodeBuiltin(specifier)) {
                    const stripped = specifier.replace(/^node:/, "");
                    let prefixId: string = stripped;

                    if (resolvedExternalsOptions.builtinsPrefix === "add" || !isNodeBuiltin(stripped)) {
                        prefixId = `node:${stripped}`;
                    }

                    return {
                        external: (resolvedExternalsOptions.builtins || isIncluded(specifier)) && !isExcluded(specifier),
                        id: resolvedExternalsOptions.builtinsPrefix === "ignore" ? specifier : prefixId,
                        moduleSideEffects: false,
                    };
                }

                return undefined;
            },
            order: "pre",
        },
    };
};
