import { createFilter } from "@rollup/pluginutils";
import type { FindPackageJsonCache } from "@visulima/package";
import { findPackageJson } from "@visulima/package/package-json";
import { dirname } from "@visulima/path";
import { ResolverFactory } from "oxc-resolver";
import type { Plugin } from "rollup";

import type { OXCResolveOptions } from "./types";

// Virtual / null-byte module ids are owned by the plugin that emitted them and are
// never resolvable on disk.
const VIRTUAL_ID_RE = /^\0/;

/**
 * Derives the `moduleSideEffects` predicate for a resolved module from the owning
 * package.json `sideEffects` field. Extracted from the resolver handler to keep the
 * handler's branching within the cognitive-complexity budget.
 *
 * Defaults to *true* (module has side effects → not stripped) when no `sideEffects`
 * field is declared, matching rollup's / `@rollup/plugin-node-resolve`'s convention:
 * only an explicit `sideEffects: false` opts a package into aggressive tree-shaking.
 */
const buildSideEffectsPredicate = (
    packageSideEffects: boolean | string[] | undefined,
    packageRoot: string,
): (location: string) => boolean => {
    if (typeof packageSideEffects === "boolean") {
        return () => packageSideEffects;
    }

    if (Array.isArray(packageSideEffects)) {
        const finalPackageSideEffects = packageSideEffects.map((sideEffect) => {
            /*
             * The array accepts simple glob patterns to the relevant files... Patterns like .css, which do not include a /, will be treated like **\/.css.
             * https://webpack.js.org/guides/tree-shaking/
             */
            if (sideEffect.includes("/")) {
                return sideEffect;
            }

            return `**/${sideEffect}`;
        });

        return createFilter(finalPackageSideEffects, undefined, { resolve: packageRoot });
    }

    return (_: string) => true;
};

const oxcResolvePlugin = (options: OXCResolveOptions, rootDirectory: string, logger: Console, tsconfigPath?: string): Plugin => {
    const { ignoreSideEffectsForRoot, ...userOptions } = options;

    // Per-plugin-instance state. packem builds multiple environments / formats /
    // presets (ESM+CJS, server/client, DTS pass) in a single process, each calling
    // this factory with its own rootDirectory / tsconfigPath / conditionNames.
    // A module-scoped resolver (constructed once via `??=`) would capture the FIRST
    // build's options and silently resolve every later build against the wrong
    // configuration; a shared package.json cache would likewise leak sideEffects
    // decisions across builds. Keep both scoped to the plugin instance.
    const packageJsonCache: FindPackageJsonCache = new Map();

    const resolver = new ResolverFactory({
        ...userOptions,
        roots: [...userOptions.roots ?? [], rootDirectory],
        tsconfig: tsconfigPath ? { configFile: tsconfigPath, references: "auto" } : undefined,
    });

    return <Plugin>{
        name: "oxc-resolve",
        resolveId: {
            // Virtual ids (`\0...`) are owned by the emitting plugin (commonjs interop,
            // import-attributes, native-modules, …) and are not real filesystem paths.
            // Skip them natively so they never hit the oxc resolver, which would fail and
            // emit a noisy debug log for every virtual module.
            filter: {
                id: {
                    exclude: VIRTUAL_ID_RE,
                },
            },
            async handler(source, importer, resolveOptions) {
                // Defensive: even with the native filter, guard against virtual ids that
                // some bundlers may still route here (filter forwarding varies).
                if (source.startsWith("\0")) {
                    return undefined;
                }

                const { isEntry } = resolveOptions;
                const resolveDirectory = isEntry || !importer ? dirname(source) : dirname(importer);

                const { error, path: id } = await resolver.async(resolveDirectory, source);

                if (error) {
                    logger.debug(error, {
                        context: [
                            {
                                basedir: rootDirectory,
                                extensions: userOptions.extensions,
                                id,
                            },
                        ],
                    });

                    return undefined;
                }

                // See buildSideEffectsPredicate for the default-to-true rationale.
                let hasModuleSideEffects: (location: string) => boolean = (_: string) => true;

                try {
                    const { packageJson, path } = await findPackageJson(dirname(id as string), {
                        cache: packageJsonCache,
                    });

                    const packageRoot = dirname(path);

                    if (!ignoreSideEffectsForRoot || rootDirectory !== packageRoot) {
                        hasModuleSideEffects = buildSideEffectsPredicate(packageJson.sideEffects, packageRoot);
                    }
                } catch (catchError: unknown) {
                    const errorMessage = catchError instanceof Error ? catchError.message : String(catchError);

                    logger.debug(errorMessage, {
                        context: [
                            {
                                basedir: resolveDirectory,
                                caller: "Resolver",
                                error: catchError,
                                extensions: userOptions.extensions,
                                id,
                            },
                        ],
                    });
                }

                // Query-suffixed specifiers (`./icon.svg?data-uri`, `./file.txt?raw`,
                // `./x.css?url`) are resolved by oxc-resolver to "<abs-path><query>".
                // Re-running that through `this.resolve()` returns null — rollup's
                // default resolver can't stat a path that ends in `?query` — which
                // would drop the import as unresolved. Downstream load plugins (raw,
                // data-uri, url) consume the query directly, so return the resolved
                // id as-is and skip the round-trip.
                if (source.includes("?")) {
                    return { id: id as string, moduleSideEffects: hasModuleSideEffects(id as string) };
                }

                const rollupResolvedResult = await this.resolve(id as string, importer, {
                    skipSelf: true,
                    ...resolveOptions,
                });

                if (rollupResolvedResult) {
                    // Handle plugins that manually make the result external and the external option
                    if (rollupResolvedResult.external) {
                        return false;
                    }

                    // Allow other plugins to take over resolution
                    if (rollupResolvedResult.id !== id) {
                        return rollupResolvedResult;
                    }

                    return { id, meta: rollupResolvedResult.meta, moduleSideEffects: hasModuleSideEffects(id) };
                }

                return undefined;
            },
            order: "post",
        },
    };
};

export default oxcResolvePlugin;
