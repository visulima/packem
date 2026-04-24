import fs from "node:fs";

import { cyan } from "@visulima/colorize";
import type { BuildContext } from "@visulima/packem-share/types";
import { getPackageName } from "@visulima/packem-share/utils";
import type { Pail } from "@visulima/pail";
import { isAbsolute } from "@visulima/path";
import { resolveAlias, toPath } from "@visulima/path/utils";
import { isNodeBuiltin, parseNodeModulePath } from "mlly";
import type { InputOptions, Plugin, ResolveIdResult } from "rollup";

import type { InternalBuildOptions } from "../../types";
import { isBareSpecifier, isFromNodeModules, parseSpecifier } from "../../utils/import-specifier.js";
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
            prefix: "plugin:packem:externals",
        });
    }

    calledImplicitExternals.set(originalId, true);
};

const prefixedBuiltins = new Set(["node:sqlite", "node:test"]);

// npm package names can never contain `:` or `\`, so anything with either is
// a misidentified filesystem path (typically a Windows drive letter or a
// backslash-separated source path that slipped past the bare-specifier check).
const INVALID_PACKAGE_NAME_CHAR_RE = /[\\:]/;

const isValidPackageName = (name: string): boolean => name.length > 0 && !INVALID_PACKAGE_NAME_CHAR_RE.test(name);

const typesPrefix = "@types/";

const getAtTypesPackageName = (packageName: string): string => {
    if (packageName.startsWith("@")) {
        const [scope, name] = packageName.split("/");

        return `${scope}/types/${name}`;
    }

    return `${typesPrefix}${packageName}`;
};

const getOriginalPackageName = (typePackageName: string): string => {
    if (typePackageName.startsWith("@")) {
        const parts = typePackageName.split("/");

        if (parts[1] === "types") {
            return `@${parts[0]}/${parts.slice(2).join("/")}`;
        }
    }

    return typePackageName.replace(typesPrefix, "");
};

const dependencyTypes = ["peerDependencies", "dependencies", "optionalDependencies"] as const;

/**
 * User-facing configuration for externals classification, mirrored at
 * `packem.config.ts` → `rollup.resolveExternals`.
 */
export type ResolveExternalsPluginOptions = {
    /**
     * Mark node built-in modules like `path`, `fs`... as external.
     *
     * Set to `false` to use shims/polyfills instead.
     * @default true
     */
    builtins?: boolean;

    /**
     * `node:` prefix handling for imports of Node builtins:
     * - `'add'`    turns `'path'` into `'node:path'`
     * - `'strip'`  turns `'node:path'` into `'path'`
     * - `'ignore'` leaves names as written
     * @default "add"
     */
    builtinsPrefix?: "add" | "ignore" | "strip";

    /** Mark `dependencies` as external. @default true */
    deps?: boolean;

    /** Mark `devDependencies` as external. @default false */
    devDeps?: boolean;

    /**
     * Force exclude these ids from the external list, regardless of other
     * settings. @default []
     */
    exclude?: MaybeFalsy<RegExp | string>[];

    /** Mark `optionalDependencies` as external. @default true */
    optDeps?: boolean;

    /** Mark `peerDependencies` as external. @default true */
    peerDeps?: boolean;
};

export type ExternalsPluginOptions = {
    /**
     * Patterns whose types the DTS plugin should inline rather than leaving as
     * external imports. Matched specifiers return `undefined` from resolveId
     * and are added to the `exclude` list for `options.external` so later
     * plugins (including the DTS resolver) can load them, but they are still
     * recorded in `usedDependencies` when declared in package.json.
     * Uses the same format as rollup-plugin-dts's `resolve` option. Only
     * meaningful for DTS builds.
     */
    dtsResolve?: boolean | (string | RegExp)[];

    /**
     * Enables recommendation warnings for @types/X vs X dependency-placement
     * mismatches. Enabled for DTS builds.
     */
    forTypes?: boolean;

    /**
     * Suppresses the "imported but not declared in package.json" warning.
     * Enabled for DTS builds where type imports may legitimately reach
     * packages that are not runtime deps.
     */
    skipUnlistedWarnings?: boolean;
};

/**
 * Unified externals plugin.
 *
 * Owns every external decision for bare specifiers and node builtins, and is
 * the single place that populates `context.usedDependencies`,
 * `context.hoistedDependencies`, and `context.implicitDependencies`.
 *
 * Replaces the earlier pair of plugins (`externalize-dependencies` +
 * `resolve-externals-plugin`) where external decisions were split between a
 * `resolveId` direct return and an `options.external` callback. That split
 * caused type-only imports to escape usage tracking, because returning
 * `{ external: true }` from `resolveId` short-circuits before rollup's
 * `options.external` fallback runs.
 *
 * Tracking and the final "is this id external?" decision live in
 * `options.external` (rollup's final arbiter, called for every import
 * including ones already resolved by other plugins). `resolveId` only
 * handles cases that need plugin context — `this.resolve`/`this.error` for
 * devDeps, `#` imports, and node builtin prefix handling.
 */
export const externalsPlugin = (context: BuildContext<InternalBuildOptions>, options?: ExternalsPluginOptions): Plugin => {
    const cwd = fs.realpathSync.native(process.cwd());
    const { pkg } = context;

    // Build the runtime-dep set. @types/X packages are imported as X at runtime
    // (e.g. @types/react is imported as "react"), so normalize them here.
    const runtimeDependencies = new Set<string>();

    for (const property of dependencyTypes) {
        const deps = pkg[property];

        if (deps) {
            for (const packageName of Object.keys(deps)) {
                if (packageName.startsWith(typesPrefix)) {
                    runtimeDependencies.add(getOriginalPackageName(packageName));
                } else {
                    runtimeDependencies.add(packageName);
                }
            }
        }
    }

    const devDeps = new Set<string>(Object.keys(pkg.devDependencies || {}));

    const resolvedExternalsOptions = context.options?.rollup?.resolveExternals ?? {};

    // User-configured externals (from `externals` option + classified deps) form
    // the include set; `resolveExternals.exclude` + DTS `resolve` form the exclude set.
    const include = new Set(getRegExps([...context.options?.externals ?? []], "include", context.logger));
    const exclude = new Set(getRegExps([...resolvedExternalsOptions.exclude ?? []], "exclude", context.logger));

    // dtsResolve adds to `exclude` so classified-dep externalization doesn't re-externalize
    // packages whose types the DTS plugin wants to inline.
    if (options?.dtsResolve) {
        if (options.dtsResolve === true) {
            exclude.add(/.*/);
        } else {
            for (const pattern of options.dtsResolve) {
                if (typeof pattern === "string") {
                    exclude.add(new RegExp(`^${pattern.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}(?:/.+)?$`));
                } else {
                    exclude.add(pattern);
                }
            }
        }
    }

    const shouldResolveForDts = (id: string): boolean => {
        const { dtsResolve } = options ?? {};

        if (!dtsResolve) {
            return false;
        }

        if (typeof dtsResolve === "boolean") {
            return dtsResolve;
        }

        return dtsResolve.some((pattern) => (typeof pattern === "string" ? id === pattern : pattern.test(id)));
    };

    const classifiedDeps: Record<string, string> = {
        ...resolvedExternalsOptions.deps ? pkg.dependencies ?? {} : undefined,
        ...resolvedExternalsOptions.devDeps ? pkg.devDependencies ?? {} : undefined,
        ...resolvedExternalsOptions.peerDeps ? pkg.peerDependencies ?? {} : undefined,
        ...resolvedExternalsOptions.optDeps ? pkg.optionalDependencies ?? {} : undefined,
    };
    const classifiedNames = Object.keys(classifiedDeps);

    if (classifiedNames.length > 0) {
        include.add(new RegExp(`^(?:${classifiedNames.join("|")})(?:/.+)?$`));
    }

    if (pkg?.peerDependenciesMeta) {
        for (const [key, value] of Object.entries(pkg.peerDependenciesMeta)) {
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

    const resolvedAliases = resolveAliases(pkg, context.options);
    const sourceDirPattern = context.options?.sourceDir
        ? new RegExp(String.raw`(?:^|/)${context.options.sourceDir.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}/`)
        : undefined;

    const warnedAtTypes = new Set<string>();
    const warnedUnlisted = new Set<string>();

    // Cache the external-decision function's result per id. usedDependencies /
    // hoistedDependencies are idempotent sets so repeated add() calls are safe;
    // caching only skips recomputation.
    const cacheResolved = new Map<string, boolean>();

    return <Plugin>{
        name: "packem:externals",

        // The options hook sets rollup's `external` function — the final arbiter rollup
        // consults for every import (including ones already resolved by other plugins).
        // This is where tracking and the external decision for bare specifiers + builtins
        // live, so type-only imports are recorded even when erased from the JS output.
        options: (rollupOptions: InputOptions) => {
            // eslint-disable-next-line no-param-reassign, sonarjs/cognitive-complexity
            rollupOptions.external = (rawOriginalId: string, rawImporter: string | undefined) => {
                if (cacheResolved.has(rawOriginalId)) {
                    return cacheResolved.get(rawOriginalId);
                }

                const originalId = toPath(rawOriginalId);
                const importer = rawImporter ? toPath(rawImporter) : undefined;

                let resolvedId: string | undefined;

                if (Object.keys(resolvedAliases).length > 0) {
                    const resolved = resolveAlias(originalId, resolvedAliases);

                    if (resolved !== originalId) {
                        resolvedId = resolved;
                    }
                }

                // Extract the package name for tracking.
                const parsedName
                    = (resolvedId && isBareSpecifier(resolvedId) && parseNodeModulePath(resolvedId)?.name)
                    || (isBareSpecifier(originalId) && parseNodeModulePath(originalId)?.name)
                    || (isBareSpecifier(originalId) ? getPackageName(originalId) : "");
                const packageName = parsedName && isBareSpecifier(parsedName) && isValidPackageName(parsedName) ? parsedName : "";

                // Tracking runs up front (before any decision branch), so type-only
                // imports resolved by the DTS pass are still recorded.
                if (packageName && !isNodeBuiltin(packageName)) {
                    context.usedDependencies.add(packageName);

                    const importerFromSource = !importer || !isFromNodeModules(importer, context.options.rootDir);
                    const declared
                        = Object.keys(pkg.dependencies ?? {}).includes(packageName)
                        || Object.keys(pkg.devDependencies ?? {}).includes(packageName)
                        || Object.keys(pkg.peerDependencies ?? {}).includes(packageName)
                        || Object.keys(pkg.optionalDependencies ?? {}).includes(packageName);

                    if (
                        importerFromSource
                        && !declared
                        && context.options.validation
                        && context.options.validation.dependencies !== false
                        && context.options.validation.dependencies.hoisted !== false
                        && !context.options.validation.dependencies.hoisted?.exclude.includes(packageName)
                    ) {
                        context.hoistedDependencies.add(packageName);
                    }
                }

                for (const candidate of [originalId, resolvedId].filter(Boolean) as string[]) {
                    // Self-import: `pkg.name` exactly or `pkg.name/subpath`. A loose
                    // `startsWith(pkg.name)` match would incorrectly treat sibling workspace
                    // packages sharing the same scope+prefix (e.g. `@visulima/packem-rollup`
                    // for `@visulima/packem`) as self-imports and stop them from being marked
                    // external, causing rollup to load their dist files during the DTS build.
                    const isSelfImport = pkg.name
                        ? candidate === pkg.name || candidate.startsWith(`${pkg.name}/`)
                        : false;

                    if (
                        /^(?:\0|\.{1,2}\/)/.test(candidate)
                        || isAbsolute(candidate)
                        || (sourceDirPattern?.test(candidate) ?? false)
                        || isSelfImport
                    ) {
                        cacheResolved.set(rawOriginalId, false);

                        return false;
                    }

                    if (isNodeBuiltin(candidate) || prefixedBuiltins.has(candidate)) {
                        let result = resolvedExternalsOptions.builtins;

                        if (result === undefined && importer) {
                            result = isIncluded(importer) && !isExcluded(importer);
                        }

                        cacheResolved.set(rawOriginalId, result as boolean);

                        return result;
                    }

                    if (candidate[0] === "#" && !candidate.startsWith("#/")) {
                        // `#` imports are handled by the resolveId hook — never external here.
                        cacheResolved.set(rawOriginalId, false);

                        return false;
                    }

                    if (tsconfigPathPatterns.some((rx) => rx.test(candidate))) {
                        cacheResolved.set(rawOriginalId, false);

                        return false;
                    }

                    if (packageName && shouldResolveForDts(packageName)) {
                        // dtsResolve wants this package's types inlined; let rollup / DTS plugin
                        // resolve it. Tracking already happened above.
                        cacheResolved.set(rawOriginalId, false);

                        return false;
                    }

                    if (isIncluded(candidate) && !isExcluded(candidate)) {
                        cacheResolved.set(rawOriginalId, true);

                        return true;
                    }
                }

                context.implicitDependencies.add(originalId);

                logExternalMessage(originalId, context.logger);

                cacheResolved.set(rawOriginalId, false);

                return false;
            };
        },

        resolveId: {
            filter: {
                id: (id: string) => !id.startsWith("\0"),
            },
            async handler(id: string, importer: string | undefined, resolveOptions): Promise<ResolveIdResult> {
                if (resolveOptions.isEntry) {
                    return undefined;
                }

                // Package.json `imports` (# prefixed) from source — externalize so Node
                // resolves them at runtime. `#/` patterns are tsconfig aliases, not package imports.
                if (id[0] === "#" && !id.startsWith("#/") && pkg.imports) {
                    if (importer && !isFromNodeModules(importer, context.options.rootDir)) {
                        return { external: true, id };
                    }

                    return undefined;
                }

                if (prefixedBuiltins.has(id)) {
                    return {
                        external: true,
                        id,
                        moduleSideEffects: false,
                    };
                }

                if (isNodeBuiltin(id)) {
                    const stripped = id.replace(/^node:/, "");
                    let prefixId: string = stripped;

                    if (resolvedExternalsOptions.builtinsPrefix === "add" || !isNodeBuiltin(stripped)) {
                        prefixId = `node:${stripped}`;
                    }

                    return {
                        external: (resolvedExternalsOptions.builtins || isIncluded(id)) && !isExcluded(id),
                        id: resolvedExternalsOptions.builtinsPrefix === "ignore" ? id : prefixId,
                        moduleSideEffects: false,
                    };
                }

                if (!isBareSpecifier(id) || id.includes("?") || id.includes(" ")) {
                    return undefined;
                }

                const [specifierPkg] = parseSpecifier(id);

                // devDependency — if user externals included it, options.external handles that.
                // Otherwise resolve and bundle; fail fast on unresolvable declared deps.
                if (devDeps.has(specifierPkg) && !runtimeDependencies.has(specifierPkg)) {
                    if (isIncluded(id) && !isExcluded(id)) {
                        // Let options.external mark it external — no need to resolve.
                        return undefined;
                    }

                    // DTS build: the DTS resolver owns type resolution entirely.
                    //
                    // For devDeps on the `dtsResolve` inline list, returning undefined hands
                    // off to the DTS resolver which picks the `.d.ts` through the types
                    // condition. Resolving here would go through the JS node-resolve
                    // conditions and return the package's `.js` entry, erasing the types
                    // before the DTS pipeline sees them.
                    //
                    // For devDeps NOT on the inline list, externalize directly. Going
                    // through node-resolve would blow up for types-only packages that have
                    // no `.js` entry in their `exports` field (e.g. `type-fest`, `@types/*`)
                    // — the package is meant to be externalized anyway, so there's no
                    // reason to look up a non-existent JS entry.
                    if (options?.forTypes) {
                        if (options.dtsResolve && shouldResolveForDts(specifierPkg)) {
                            return undefined;
                        }

                        return { external: true, id, moduleSideEffects: false };
                    }

                    const resolved = await this.resolve(id, importer, { skipSelf: true, ...resolveOptions });

                    if (!resolved) {
                        throw new Error(`Could not resolve "${id}" even though it's declared in package.json. Try re-installing node_modules.`);
                    }

                    if (options?.forTypes) {
                        const atTypesName = getAtTypesPackageName(specifierPkg);

                        if (runtimeDependencies.has(atTypesName) && !warnedAtTypes.has(atTypesName)) {
                            warnedAtTypes.add(atTypesName);
                            context.logger.warn(
                                `Recommendation: "${atTypesName}" is externalized but "${specifierPkg}" is bundled (devDependencies). This may cause type mismatches for consumers. Consider moving "${specifierPkg}" to dependencies or "${atTypesName}" to devDependencies.`,
                            );
                        }
                    }

                    return resolved;
                }

                // Runtime-dep @types recommendation + unlisted warning. The external decision
                // for these is handled by options.external.
                if (runtimeDependencies.has(specifierPkg)) {
                    if (options?.forTypes) {
                        const atTypesName = getAtTypesPackageName(specifierPkg);

                        if (devDeps.has(atTypesName) && !warnedAtTypes.has(atTypesName)) {
                            warnedAtTypes.add(atTypesName);
                            context.logger.warn(
                                `Recommendation: "${atTypesName}" is bundled (devDependencies) but "${specifierPkg}" is externalized. Place "${atTypesName}" in dependencies/peerDependencies as well so users don't have missing types.`,
                            );
                        }
                    }

                    return undefined;
                }

                if (!devDeps.has(specifierPkg) && importer && !isFromNodeModules(importer, cwd) && !options?.skipUnlistedWarnings && !warnedUnlisted.has(specifierPkg)) {
                    warnedUnlisted.add(specifierPkg);
                    context.logger.warn(
                        `"${specifierPkg}" imported by "${importer}" but not declared in package.json. Will be bundled to prevent failure at runtime.`,
                    );
                }

                // DTS build fallback: an unclassified bare specifier imported from inside
                // `node_modules` (i.e. a transitive dep of a package we're inlining) must
                // not be routed through `node-resolve` — types-only transitive deps would
                // crash on the missing JS entry. Let the consumer resolve these themselves.
                if (options?.forTypes && importer && isFromNodeModules(importer, cwd)) {
                    return { external: true, id, moduleSideEffects: false };
                }

                return undefined;
            },
            order: "pre",
        },
    };
};

