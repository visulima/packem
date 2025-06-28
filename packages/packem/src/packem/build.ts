import { stat } from "node:fs/promises";

import { bold, cyan, gray, green } from "@visulima/colorize";
import { walk } from "@visulima/fs";
import { formatBytes } from "@visulima/humanizer";
import type { Pail } from "@visulima/pail";
import { join, relative, resolve } from "@visulima/path";

import rollupBuild from "../rollup/build";
import rollupBuildTypes from "../rollup/build-types";
import type { BuildEntry, InternalBuildOptions } from "../types";
import type { FileCache } from "@visulima/packem-share";
import brotliSize from "./utils/brotli-size";
import groupByKeys from "./utils/group-by-keys";
import gzipSize from "./utils/gzip-size";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
/**
 * Displays size information for build outputs including entries, chunks, and assets.
 * Provides detailed size metrics including total size, brotli size, and gzip size.
 * @param logger Logger instance for output
 * @param context Build context containing build configuration and state
 * @returns Boolean indicating whether any entries were logged
 * @internal
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
const showSizeInformation = (logger: Pail, context: BuildContext<InternalBuildOptions>): boolean => {
    const rPath = (p: string) => relative(context.options.rootDir, resolve(context.options.outDir, p));

    let loggedEntries = false;

    const foundDtsEntries: string[] = [];
    const entries = context.buildEntries.filter((bEntry) => bEntry.type === "entry");

    if (entries.length > 0) {
        logger.raw("Entries:\n");

        for (const entry of entries) {
            let totalBytes = entry.size?.bytes ?? 0;
            let chunkBytes = 0;

            for (const chunk of entry.chunks ?? []) {
                const bytes = context.buildEntries.find((bEntry) => bEntry.path.endsWith(chunk))?.size?.bytes ?? 0;

                totalBytes += bytes;
                chunkBytes += bytes;
            }

            let line = `  ${bold(rPath(entry.path))} (${[
                `total size: ${
                    cyan(
                        formatBytes(totalBytes, {
                            decimals: 2,
                        }),
                    )}`,
                entry.size?.brotli
                && `brotli size: ${
                    cyan(
                        formatBytes(entry.size.brotli, {
                            decimals: 2,
                        }),
                    )}`,
                entry.size?.gzip
                && `gzip size: ${
                    cyan(
                        formatBytes(entry.size.gzip, {
                            decimals: 2,
                        }),
                    )}`,
                chunkBytes !== 0
                && `chunk size: ${
                    cyan(
                        formatBytes(chunkBytes, {
                            decimals: 2,
                        }),
                    )}`,
            ]
                .filter(Boolean)
                .join(", ")})`;

            line += entry.exports?.length ? `\n  exports: ${gray(entry.exports.join(", "))}` : "";

            if (entry.chunks?.length) {
                line += `\n${entry.chunks
                    .map((p) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const chunk = context.buildEntries.find((buildEntry) => buildEntry.path === p) ?? ({} as any);

                        return gray(
                            `  └─ ${
                                rPath(p)
                            }${bold(
                                chunk.bytes
                                    ? ` (${
                                        formatBytes(chunk?.bytes, {
                                            decimals: 2,
                                        })
                                    })`
                                    : "",
                            )}`,
                        );
                    })
                    .join("\n")}`;
            }

            if (entry.dynamicImports && entry.dynamicImports.length > 0) {
                line += "\n  dynamic imports:";
                line += `\n${entry.dynamicImports.map((p) => gray(`  └─ ${rPath(p)}`)).join("\n")}`;
            }

            if (entry.modules && entry.modules.length > 0) {
                const moduleList = entry.modules
                    .filter((m) => m.id.includes("node_modules"))
                    .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
                    .map((m) =>
                        gray(
                            `  📦 ${
                                rPath(m.id)
                            }${bold(
                                m.bytes
                                    ? ` (${
                                        formatBytes(m.bytes, {
                                            decimals: 2,
                                        })
                                    })`
                                    : "",
                            )}`,
                        ),
                    )
                    .join("\n");

                line += moduleList.length > 0 ? `\n  inlined modules:\n${moduleList}` : "";
            }

            if (context.options.declaration) {
                const cjsJSExtension = context.options.outputExtensionMap?.cjs ?? "cjs";
                const esmJSExtension = context.options.outputExtensionMap?.esm ?? "mjs";

                let dtsPath = entry.path.replace(/\.js$/, ".d.ts");
                let type = "commonjs";

                if (entry.path.endsWith(`.${cjsJSExtension}`)) {
                    dtsPath = entry.path.replace(new RegExp(`\\.${cjsJSExtension}$`), ".d.cts");
                } else if (entry.path.endsWith(`.${esmJSExtension}`)) {
                    type = "module";
                    dtsPath = entry.path.replace(new RegExp(`\\.${esmJSExtension}$`), ".d.mts");
                }

                const foundDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));

                if (foundDts) {
                    foundDtsEntries.push(foundDts.path);

                    let foundCompatibleDts: BuildContextBuildAssetAndChunk | BuildContextBuildEntry | undefined;

                    if (!dtsPath.includes(".d.ts")) {
                        dtsPath = (dtsPath as string).replace(new RegExp(`\\.d.mts$`), `.d.cts`);

                        foundCompatibleDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));
                    }

                    if (foundCompatibleDts) {
                        foundDtsEntries.push(foundCompatibleDts.path);

                        if (type === "commonjs") {
                            line += `\n  types:\n${
                                [foundDts, foundCompatibleDts]
                                    .map(
                                        (value: BuildContextBuildAssetAndChunk | BuildContextBuildEntry) =>
                                            `${gray("  └─ ")
                                            + bold(rPath(value.path))
                                            } (total size: ${
                                                cyan(
                                                    formatBytes(value.size?.bytes ?? 0, {
                                                        decimals: 2,
                                                    }),
                                                )
                                            })`,
                                    )
                                    .join("\n")}`;
                        } else {
                            line += `\n  types: ${
                                bold(rPath(foundDts.path))
                            } (total size: ${
                                cyan(
                                    formatBytes(foundDts.size?.bytes ?? 0, {
                                        decimals: 2,
                                    }),
                                )
                            })`;
                        }
                    }
                }
            }

            loggedEntries = true;

            line += "\n\n";

            logger.raw(entry.chunk ? gray(line) : line);
        }
    }

    const assets = context.buildEntries.filter((bEntry) => bEntry.type === "asset");

    if (assets.length > 0) {
        let line = "Assets:";

        for (const asset of context.buildEntries.filter((bEntry) => bEntry.type === "asset" && !foundDtsEntries.includes(bEntry.path))) {
            line
                += `${gray("\n  └─ ")
                + bold(rPath(asset.path))
                } (total size: ${
                    cyan(
                        formatBytes(asset.size?.bytes ?? 0, {
                            decimals: 2,
                        }),
                    )
                })`;
        }

        line += "\n\n";

        logger.raw(line);
    }

    if (loggedEntries) {
        logger.raw(
            "Σ Total dist size (byte size):",
            cyan(
                formatBytes(
                    context.buildEntries.reduce((index, entry) => index + (entry.size?.bytes ?? 0), 0),
                    {
                        decimals: 2,
                    },
                ),
            ),
            "\n",
        );
    }

    return loggedEntries;
};

/**
 * Properties required for building a package or type definitions.
 * @interface
 * @property {BuildContext<InternalBuildOptions>} context - Build context containing configuration and state
 * @property {FileCache} fileCache - Cache instance for file operations
 * @property {string} subDirectory - Subdirectory for output files
 */
interface BuilderProperties {
    context: BuildContext<InternalBuildOptions>;
    fileCache: FileCache;
    subDirectory: string;
}

const DTS_REGEX = /\.d\.[mc]?ts$/;

/**
 * Prepares Rollup configuration for both JavaScript/TypeScript builds and type definition builds.
 * Processes entries and generates appropriate builder configurations.
 * @param context Build context containing configuration and state
 * @param fileCache Cache instance for file operations
 * @returns Object containing sets of builders for both source and type definitions
 * @internal
 */
const prepareRollupConfig = (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
): {
    builders: Set<BuilderProperties>;
    typeBuilders: Set<BuilderProperties>;
    // eslint-disable-next-line sonarjs/cognitive-complexity
} => {
    const groupedEntries = groupByKeys(context.options.entries, "environment", "runtime");

    const builders = new Set<BuilderProperties>();
    const typeBuilders = new Set<BuilderProperties>();

    for (const [environment, environmentEntries] of Object.entries(groupedEntries)) {
        for (const [runtime, entries] of Object.entries(environmentEntries)) {
            const environmentRuntimeContext = {
                ...context,
            };

            if (!context.options.dtsOnly && (environment !== "undefined" || runtime !== "undefined")) {
                context.logger.info(
                    `Preparing build for ${
                        environment === "undefined" ? "" : `${cyan(environment)} environment${runtime === "undefined" ? "" : " with "}`
                    }${runtime === "undefined" ? "" : `${cyan(runtime)} runtime`}`,
                );
            }

            const replaceValues: Record<string, string> = {};

            if (environmentRuntimeContext.options.rollup.replace) {
                if (environmentRuntimeContext.options.rollup.replace.values === undefined) {
                    environmentRuntimeContext.options.rollup.replace.values = {};
                }

                if (environment !== "undefined") {
                    // hack to make sure, that the replace plugin don't replace the environment
                    replaceValues[["process", "env", "NODE_ENV"].join(".")] = JSON.stringify(environment);
                }

                replaceValues[["process", "env", "EdgeRuntime"].join(".")] = JSON.stringify(runtime === "edge-light");

                Object.freeze(replaceValues);
            } else {
                context.logger.warn("'replace' plugin is disabled. You should enable it to replace 'process.env.*' environments.");
            }

            let subDirectory = "";

            if (environment !== "undefined") {
                subDirectory += `${environment}/`;
            }

            if (runtime !== "undefined") {
                subDirectory += `${runtime}/`;
            }

            let minify = false;

            if (environmentRuntimeContext.options.minify !== undefined) {
                minify = environmentRuntimeContext.options.minify;
            }

            if (environment === "development") {
                minify = false;
            } else if (environment === "production") {
                minify = true;
            }

            const esmAndCjsEntries: BuildEntry[] = [];
            const esmEntries: BuildEntry[] = [];
            const cjsEntries: BuildEntry[] = [];
            const dtsEntries: BuildEntry[] = [];

            for (const entry of entries) {
                if (entry.cjs && entry.esm) {
                    esmAndCjsEntries.push(entry);
                } else if (entry.cjs) {
                    cjsEntries.push(entry);
                } else if (entry.esm) {
                    esmEntries.push(entry);
                } else if (entry.declaration) {
                    dtsEntries.push(entry);
                }
            }

            if (esmAndCjsEntries.length > 0) {
                const adjustedEsmAndCjsContext: BuildContext<InternalBuildOptions> = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: true,
                        emitESM: true,
                        entries: [...esmAndCjsEntries].filter((entry) => !DTS_REGEX.test(entry.input)),
                        minify,
                        rollup: {
                            ...environmentRuntimeContext.options.rollup,
                            replace: environmentRuntimeContext.options.rollup.replace
                                ? {
                                    ...environmentRuntimeContext.options.rollup.replace,
                                    values: {
                                        ...environmentRuntimeContext.options.rollup.replace.values,
                                        ...replaceValues,
                                    },
                                }
                                : false,
                        },
                    },
                };

                if (!context.options.dtsOnly) {
                    builders.add({ context: adjustedEsmAndCjsContext, fileCache, subDirectory });
                }

                if (context.options.declaration) {
                    const typedEntries = [...esmAndCjsEntries].filter((entry) => entry.declaration);

                    if (typedEntries.length > 0) {
                        typeBuilders.add({
                            context: {
                                ...adjustedEsmAndCjsContext,
                                options: {
                                    ...adjustedEsmAndCjsContext.options,
                                    entries: typedEntries,
                                },
                            },
                            fileCache,
                            subDirectory,
                        });
                    }
                }
            }

            if (esmEntries.length > 0) {
                const adjustedEsmContext: BuildContext<InternalBuildOptions> = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: false,
                        emitESM: true,
                        entries: [...esmEntries].filter((entry) => !DTS_REGEX.test(entry.input)),
                        minify,
                        rollup: {
                            ...environmentRuntimeContext.options.rollup,
                            replace: environmentRuntimeContext.options.rollup.replace
                                ? {
                                    ...environmentRuntimeContext.options.rollup.replace,
                                    values: {
                                        ...environmentRuntimeContext.options.rollup.replace.values,
                                        ...replaceValues,
                                    },
                                }
                                : false,
                        },
                    },
                };

                if (!context.options.dtsOnly) {
                    builders.add({ context: adjustedEsmContext, fileCache, subDirectory });
                }

                if (context.options.declaration) {
                    const typedEntries = [...esmEntries].filter((entry) => entry.declaration);

                    if (typedEntries.length > 0) {
                        typeBuilders.add({
                            context: {
                                ...adjustedEsmContext,
                                options: {
                                    ...adjustedEsmContext.options,
                                    entries: typedEntries,
                                },
                            },
                            fileCache,
                            subDirectory,
                        });
                    }
                }
            }

            if (cjsEntries.length > 0) {
                const adjustedCjsContext: BuildContext<InternalBuildOptions> = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: true,
                        emitESM: false,
                        entries: [...cjsEntries].filter((entry) => !DTS_REGEX.test(entry.input)),
                        minify,
                        rollup: {
                            ...environmentRuntimeContext.options.rollup,
                            replace: environmentRuntimeContext.options.rollup.replace
                                ? {
                                    ...environmentRuntimeContext.options.rollup.replace,
                                    values: {
                                        ...environmentRuntimeContext.options.rollup.replace.values,
                                        ...replaceValues,
                                    },
                                }
                                : false,
                        },
                    },
                };

                if (!context.options.dtsOnly) {
                    builders.add({ context: adjustedCjsContext, fileCache, subDirectory });
                }

                if (context.options.declaration) {
                    const typedEntries = [...cjsEntries].filter((entry) => entry.declaration);

                    if (typedEntries.length > 0) {
                        typeBuilders.add({
                            context: {
                                ...adjustedCjsContext,
                                options: {
                                    ...adjustedCjsContext.options,
                                    entries: typedEntries,
                                },
                            },
                            fileCache,
                            subDirectory,
                        });
                    }
                }
            }

            if (environmentRuntimeContext.options.declaration && dtsEntries.length > 0) {
                typeBuilders.add({
                    context: {
                        ...environmentRuntimeContext,
                        options: {
                            ...environmentRuntimeContext.options,
                            emitCJS: false,
                            emitESM: false,
                            entries: dtsEntries,
                            minify,
                            rollup: {
                                ...environmentRuntimeContext.options.rollup,
                                replace: environmentRuntimeContext.options.rollup.replace
                                    ? {
                                        ...environmentRuntimeContext.options.rollup.replace,
                                        values: {
                                            ...environmentRuntimeContext.options.rollup.replace.values,
                                            ...replaceValues,
                                        },
                                    }
                                    : false,
                            },
                        },
                    },
                    fileCache,
                    subDirectory,
                });
            }
        }
    }

    return { builders, typeBuilders };
};

/**
 * Main build function that orchestrates the entire build process.
 * Handles both JavaScript/TypeScript compilation and type definition generation.
 * @param context Build context containing configuration and state
 * @param fileCache Cache instance for file operations
 * @returns Promise resolving to a boolean indicating build success
 * @example
 * ```typescript
 * const success = await build(BuildContext<InternalBuildOptions>, new FileCache());
 * if (success) {
 *   console.log('Build completed successfully');
 * }
 * ```
 * @throws {Error} If the build process encounters critical errors
 * @public
 */
const build = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<boolean> => {
    await context.hooks.callHook("build:before", context);

    // eslint-disable-next-line etc/no-internal
    const { builders, typeBuilders } = prepareRollupConfig(context, fileCache);

    await Promise.all(
        [...builders].map(async ({ context: rollupContext, fileCache: cache, subDirectory }) => await rollupBuild(rollupContext, cache, subDirectory)),
    );
    await Promise.all(
        [...typeBuilders].map(async ({ context: rollupContext, fileCache: cache, subDirectory }) => await rollupBuildTypes(rollupContext, cache, subDirectory)),
    );

    context.logger.success(green(context.options.name ? `Build succeeded for ${context.options.name}` : "Build succeeded"));

    // Remove duplicated build entries
    context.buildEntries = context.buildEntries.filter((entry, index, self) => self.findIndex((bEntry) => bEntry.path === entry.path) === index);

    // Find all dist files and add missing entries as chunks
    for await (const file of walk(join(context.options.rootDir, context.options.outDir), {
        includeDirs: false,
        includeFiles: true,
    })) {
        const distributionPath = join(context.options.rootDir, context.options.outDir);

        let entry = context.buildEntries.find((bEntry) => join(distributionPath, bEntry.path) === file.path);

        if (!entry) {
            entry = {
                chunk: true,
                path: file.path,
            };

            context.buildEntries.push(entry);
        }

        if (entry.size === undefined) {
            entry.size = {};
        }

        const filePath = resolve(distributionPath, file.path);

        if (!entry.size.bytes) {
            const awaitedStat = await stat(filePath);

            entry.size.bytes = awaitedStat.size;
        }

        if (!entry.size.brotli) {
            entry.size.brotli = await brotliSize(filePath);
        }

        if (!entry.size.gzip) {
            entry.size.gzip = await gzipSize(filePath);
        }
    }

    await context.hooks.callHook("build:done", context);

    // eslint-disable-next-line etc/no-internal
    return showSizeInformation(context.logger, context);
};

export default build;
