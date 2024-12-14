import { createFilter } from "@rollup/pluginutils";
import type { NormalizedPackageJson } from "@visulima/package";
import { findPackageJson } from "@visulima/package/package-json";
import { dirname } from "@visulima/path";
import type { NapiResolveOptions } from "oxc-resolver";
import { ResolverFactory } from "oxc-resolver";
import type { Plugin } from "rollup";

export type OxcResolveOptions = { ignoreSideEffectsForRoot?: boolean } & Omit<NapiResolveOptions, "tsconfig">;

const packageJsonCache = new Map<string, NormalizedPackageJson>();

export const oxcResolvePlugin = (options: OxcResolveOptions, rootDirectory: string, tsconfigPath?: string) => {
    const { ignoreSideEffectsForRoot, ...userOptions } = options;

    const resolver = new ResolverFactory({
        ...userOptions,
        roots: [...(userOptions.roots ?? []), rootDirectory],
        tsconfig: tsconfigPath ? { configFile: tsconfigPath } : undefined,
    });

    return <Plugin>{
        name: "oxc-resolve",
        resolveId: {
            async handler(source, importer, { isEntry }) {
                const resolveDirectory = isEntry || !importer ? dirname(source) : dirname(importer);

                const { error, path: id } = resolver.sync(resolveDirectory, source);

                if (error) {
                    // console.debug(error, {
                    //     context: [
                    //         {
                    //             basedir,
                    //             caller: userOptions.caller,
                    //             extensions: userOptions.extensions,
                    //             id,
                    //         },
                    //     ],
                    // });
                    return null;
                }

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                let hasModuleSideEffects: (location: string) => boolean = (_: string) => false;

                try {
                    const { packageJson, path } = await findPackageJson(dirname(id as string), {
                        // @ts-expect-error - missing the correct type export
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

                            hasModuleSideEffects = createFilter(finalPackageSideEffects, null, {
                                resolve: packageRoot,
                            });
                        }
                    }
                } catch (error: any) {
                    // eslint-disable-next-line no-console
                    console.debug(error.message, {
                        context: [
                            {
                                basedir: resolveDirectory,
                                caller: "Resolver",
                                error,
                                extensions: userOptions.extensions,
                                id,
                            },
                        ],
                    });
                }

                const rollupResolvedResult = await this.resolve(id as string, importer, {
                    // ...options,
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

                return null;
            },
            order: "post",
        },
    };
};
