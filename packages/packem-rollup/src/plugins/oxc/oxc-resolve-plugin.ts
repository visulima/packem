import { createFilter } from "@rollup/pluginutils";
import type { FindPackageJsonCache } from "@visulima/package";
import { findPackageJson } from "@visulima/package/package-json";
import type { Pail } from "@visulima/pail";
import { dirname } from "@visulima/path";
import { ResolverFactory } from "oxc-resolver";
import type { Plugin } from "rollup";

import type { OxcResolveOptions } from "./types";

let cachedResolver: ResolverFactory | undefined;

const packageJsonCache: FindPackageJsonCache = new Map();

const oxcResolvePlugin = (options: OxcResolveOptions, rootDirectory: string, logger: Pail, tsconfigPath?: string): Plugin => {
    const { ignoreSideEffectsForRoot, ...userOptions } = options;

    let resolver = cachedResolver;

    if (!resolver) {
        // eslint-disable-next-line no-multi-assign
        resolver = cachedResolver = new ResolverFactory({
            ...userOptions,
            roots: [...userOptions.roots ?? [], rootDirectory],
            tsconfig: tsconfigPath ? { configFile: tsconfigPath, references: "auto" } : undefined,
        });
    }

    return <Plugin>{
        name: "oxc-resolve",
        resolveId: {
            async handler(source, importer, { isEntry }) {
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

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                let hasModuleSideEffects: (location: string) => boolean = (_: string) => false;

                try {
                    const { packageJson, path } = await findPackageJson(dirname(id as string), {
                        cache: packageJsonCache,
                    });

                    const packageRoot = dirname(path);

                    if (!ignoreSideEffectsForRoot || rootDirectory !== packageRoot) {
                        const packageSideEffects = packageJson.sideEffects;

                        if (typeof packageSideEffects === "boolean") {
                            hasModuleSideEffects = () => packageSideEffects;
                        } else if (Array.isArray(packageSideEffects)) {
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

                            hasModuleSideEffects = createFilter(finalPackageSideEffects, undefined, {
                                resolve: packageRoot,
                            });
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (catchError: any) {
                    // eslint-disable-next-line no-console
                    console.debug(catchError.message, {
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

                const rollupResolvedResult = await this.resolve(id as string, importer, {
                    skipSelf: true,
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
