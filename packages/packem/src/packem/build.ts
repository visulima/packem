import { stat } from "node:fs/promises";

import { bold, cyan, gray, green } from "@visulima/colorize";
import { walk } from "@visulima/fs";
import { formatBytes } from "@visulima/humanizer";
import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry, Environment, Runtime } from "@visulima/packem-share/types";
import { getDtsExtension, getOutputExtension } from "@visulima/packem-share/utils";
import type { Pail } from "@visulima/pail";
import { join, relative, resolve } from "@visulima/path";

import runWithConcurrency from "../lib/concurrency";
import rollupBuild from "../rollup/build";
import rollupBuildTypes from "../rollup/build-types";
import type { BuildEntry, InternalBuildOptions } from "../types";
import brotliSize from "./utils/brotli-size";
import groupByKeys from "./utils/group-by-keys";
import gzipSize from "./utils/gzip-size";

// Default concurrency limit for DTS generation to prevent memory overflow.
// Each rollup-plugin-dts instance holds TypeScript program state in memory.
// Limiting concurrency allows V8 to GC between builds.
const DEFAULT_DTS_CONCURRENCY = 2;

/**
 * Displays size information for build outputs including entries, chunks, and assets.
 * Provides detailed size metrics including total size, brotli size, and gzip size.
 * @param logger Logger instance for output
 * @param context Build context containing build configuration and state
 * @returns Boolean indicating whether any entries were logged
 * @internal
 */

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
                `total size: ${cyan(
                    formatBytes(totalBytes, {
                        decimals: 2,
                    }),
                )}`,
                entry.size?.brotli
                && `brotli size: ${cyan(
                    formatBytes(entry.size.brotli, {
                        decimals: 2,
                    }),
                )}`,
                entry.size?.gzip
                && `gzip size: ${cyan(
                    formatBytes(entry.size.gzip, {
                        decimals: 2,
                    }),
                )}`,
                chunkBytes !== 0
                && `chunk size: ${cyan(
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
                        const chunk = context.buildEntries.find((buildEntry) => buildEntry.path === p) ?? ({} as any);

                        return gray(
                            `  └─ ${rPath(p)}${bold(
                                chunk.bytes
                                    ? ` (${formatBytes(chunk?.bytes, {
                                        decimals: 2,
                                    })})`
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
                    .toSorted((a, b) => (b.bytes || 0) - (a.bytes || 0))
                    .map((m) =>
                        gray(
                            `  📦 ${rPath(m.id)}${bold(
                                m.bytes
                                    ? ` (${formatBytes(m.bytes, {
                                        decimals: 2,
                                    })})`
                                    : "",
                            )}`,
                        ),
                    )
                    .join("\n");

                line += moduleList.length > 0 ? `\n  inlined modules:\n${moduleList}` : "";
            }

            if (context.options.declaration) {
                const cjsJSExtension = getOutputExtension(context, "cjs");
                const esmJSExtension = getOutputExtension(context, "esm");
                const cjsDTSExtension = getDtsExtension(context, "cjs");
                const esmDTSExtension = getDtsExtension(context, "esm");

                let dtsPath = entry.path.replace(/\.js$/, ".d.ts");
                let type = "commonjs";

                if (entry.path.endsWith(`.${cjsJSExtension}`)) {
                    dtsPath = entry.path.replace(new RegExp(String.raw`\.${cjsJSExtension}$`), `.${cjsDTSExtension}`);
                } else if (entry.path.endsWith(`.${esmJSExtension}`)) {
                    type = "module";
                    dtsPath = entry.path.replace(new RegExp(String.raw`\.${esmJSExtension}$`), `.${esmDTSExtension}`);
                }

                const foundDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));

                if (foundDts) {
                    foundDtsEntries.push(foundDts.path);

                    let foundCompatibleDts: BuildContextBuildAssetAndChunk | BuildContextBuildEntry | undefined;

                    if (!dtsPath.includes(".d.ts")) {
                        dtsPath = (dtsPath as string).replace(/\.d\.[m|c]ts$/, `.d.ts`);

                        foundCompatibleDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));
                    }

                    if (foundCompatibleDts) {
                        foundDtsEntries.push(foundCompatibleDts.path);

                        if (type === "commonjs") {
                            line += `\n  types:\n${[foundDts, foundCompatibleDts]
                                .map(
                                    (value: BuildContextBuildAssetAndChunk | BuildContextBuildEntry) =>
                                        `${gray("  └─ ") + bold(rPath(value.path))} (total size: ${cyan(
                                            formatBytes(value.size?.bytes ?? 0, {
                                                decimals: 2,
                                            }),
                                        )})`,
                                )
                                .join("\n")}`;
                        } else {
                            line += `\n  types: ${bold(rPath(foundDts.path))} (total size: ${cyan(
                                formatBytes(foundDts.size?.bytes ?? 0, {
                                    decimals: 2,
                                }),
                            )})`;
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
            line += `${gray("\n  └─ ") + bold(rPath(asset.path))} (total size: ${cyan(
                formatBytes(asset.size?.bytes ?? 0, {
                    decimals: 2,
                }),
            )})`;
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
 * Checks if an entry name indicates a declaration-only file that should not generate JavaScript.
 * @param name Entry name to check
 * @returns True if the name ends with .d (indicating declaration-only)
 */
const isDeclarationOnlyEntry = (name: string | undefined): boolean => Boolean(name?.endsWith(".d"));

/**
 * Filters out declaration file entries from the entries array.
 * @param entries Array of build entries to filter
 * @returns Filtered entries excluding .d.ts files
 */
const filterDtsEntries = (entries: BuildEntry[]): BuildEntry[] => entries.filter((entry) => !DTS_REGEX.test(entry.input));

/**
 * Creates a formatted log message for build preparation.
 * @param environment The build environment (e.g., "development", "production")
 * @param runtime The build runtime (e.g., "browser", "node")
 * @returns Formatted log message string
 */
const createBuildLogMessage = (environment: string, runtime: string): string => {
    const parts: string[] = [];

    if (environment !== "undefined") {
        parts.push(`${cyan(environment)} environment`);
    }

    if (runtime !== "undefined") {
        parts.push(`${cyan(runtime)} runtime`);
    }

    return parts.length > 0 ? `Preparing build for ${parts.join(" with ")}` : "";
};

/**
 * Creates replace values for Rollup based on environment and runtime.
 * @param environment The build environment (e.g., "development", "production")
 * @param runtime The build runtime (e.g., "browser", "node")
 * @returns Frozen object with replace values for Rollup
 */
const createReplaceValues = (environment: string, runtime: string): Record<string, string> => {
    const replaceValues: Record<string, string> = {};

    if (environment !== "undefined") {
        // hack to make sure, that the replace plugin don't replace the environment
        replaceValues[["process", "env", "NODE_ENV"].join(".")] = JSON.stringify(environment);
    }

    replaceValues[["process", "env", "EdgeRuntime"].join(".")] = JSON.stringify(runtime === "edge-light");

    return Object.freeze(replaceValues);
};

/**
 * Creates a subdirectory path based on environment and runtime.
 * @param environment Build environment
 * @param runtime Build runtime
 * @returns Subdirectory path string
 */
const createSubDirectory = (environment: string, runtime: string): string => {
    const parts: string[] = [];

    if (environment !== "undefined") {
        parts.push(environment);
    }

    if (runtime !== "undefined") {
        parts.push(runtime);
    }

    return parts.length > 0 ? `${parts.join("/")}/` : "";
};

/**
 * Creates an adjusted build context with specific emit flags and entries.
 * @param baseContext Base build context
 * @param emitCJS Whether to emit CJS format
 * @param emitESM Whether to emit ESM format
 * @param entries Filtered entries for this build
 * @param minify Whether to minify output
 * @param replaceValues Replace values for Rollup
 * @returns Adjusted build context
 */
const createAdjustedContext = (
    baseContext: BuildContext<InternalBuildOptions>,
    emitCJS: boolean,
    emitESM: boolean,
    entries: BuildEntry[],
    minify: boolean,
    replaceValues: Record<string, string>,
): BuildContext<InternalBuildOptions> => {
    const result = {
        ...baseContext,
        options: {
            ...baseContext.options,
            emitCJS,
            emitESM,
            entries,
            minify,
            rollup: {
                ...baseContext.options.rollup,
                replace: baseContext.options.rollup.replace
                    ? {
                        ...baseContext.options.rollup.replace,
                        values: baseContext.options.rollup.replace.values ? { ...baseContext.options.rollup.replace.values } : { ...replaceValues },
                    }
                    : false,
            },
        },
    };

    return result;
};

/**
 * Prepares Rollup configuration for both JavaScript/TypeScript builds and type definition builds.
 * Processes entries and generates appropriate builder configurations.
 * @param context Build context containing configuration and state
 * @param fileCache Cache instance for file operations
 * @returns Object containing sets of builders for both source and type definitions
 * @internal
 */
const prepareRollupConfig = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
): Promise<{
    builders: Set<BuilderProperties>;
    typeBuilders: Set<BuilderProperties>;
    // eslint-disable-next-line sonarjs/cognitive-complexity
}> => {
    // Group entries by environment, runtime, and type (browser, server, development, etc.)
    // Entries with different types need separate builds even if same environment/runtime
    // Type is extracted from fileAlias/name (e.g., "index.browser" -> "browser", "index.server" -> "server")
    type GroupedEntries = Record<string, Record<string, Record<string, BuildEntry[]>>>;

    // Extract type suffix from entry name/fileAlias (e.g., "index.browser" -> "browser", "index.server" -> "server")
    const getEntryType = (entry: BuildEntry): string => {
        const nameOrAlias = entry.name ?? entry.fileAlias;

        if (!nameOrAlias) {
            return "default";
        }

        // Extract type from patterns like .browser, .server, .development, .node, .workerd
        // These patterns should appear as suffixes or before the file extension
        const typePatterns = [".browser", ".server", ".development", ".node", ".workerd"];

        for (const pattern of typePatterns) {
            // Check if the pattern exists in the name (as a suffix or before extension)
            // e.g., "index.browser" or "index.browser.ts" should match
            if (nameOrAlias.includes(pattern)) {
                return pattern.slice(1); // Remove the leading dot
            }
        }

        // If no type pattern found, return "default" to group all entries without explicit types together
        // This prevents creating separate builds for each unique entry name
        return "default";
    };

    // Add a computed 'type' property to each entry for grouping
    // We need to ensure environment and runtime are strings for grouping
    type EntryWithType = Omit<BuildEntry, "environment" | "runtime"> & {
        environment: string;
        runtime: string;
        type: string;
    };
    const entriesWithType: EntryWithType[] = context.options.entries.map((entry) => {
        return {
            ...entry,
            environment: String(entry.environment ?? "undefined"),
            runtime: String(entry.runtime ?? "undefined"),
            type: getEntryType(entry),
        };
    });

    const groupedEntries = groupByKeys(entriesWithType, "environment", "runtime", "type") as Record<
        string,
        Record<string, Record<string, EntryWithType[]>>
    > as unknown as GroupedEntries;

    const builders = new Set<BuilderProperties>();
    const typeBuilders = new Set<BuilderProperties>();

    for (const [environment, environmentEntries] of Object.entries(groupedEntries)) {
        for (const [runtime, runtimeEntries] of Object.entries(environmentEntries)) {
            for (const [, entries] of Object.entries(runtimeEntries)) {
                const environmentRuntimeContext = {
                    ...context,
                    environment: environment === "undefined" ? undefined : (environment as "development" | "production"),
                    options: {
                        ...context.options,
                        rollup: {
                            ...context.options.rollup,
                            replace: context.options.rollup.replace
                                ? {
                                    ...context.options.rollup.replace,
                                    values: {},
                                }
                                : context.options.rollup.replace,
                        },
                    },
                };

                if (!context.options.dtsOnly && (environment !== "undefined" || runtime !== "undefined")) {
                    const logMessage = createBuildLogMessage(environment, runtime);

                    if (logMessage) {
                        context.logger.info(logMessage);
                    }
                }

                // Set runtime on context options so hooks can access it
                const resolvedRuntime = runtime === "undefined" ? undefined : (runtime as "browser" | "node");

                environmentRuntimeContext.options.runtime = resolvedRuntime;

                // Call hook early to allow presets to modify replace values before createAdjustedContext
                // Use a dummy rollup options object since we don't have rollup options yet
                try {
                    await context.hooks.callHook("rollup:options", environmentRuntimeContext, {} as any);
                } catch (error) {
                    context.logger.error(`Error calling rollup:options hook: ${error}`);
                    throw error;
                }

                // Initialize replace values if replace plugin is enabled
                const defaultReplaceValues = environmentRuntimeContext.options.rollup.replace ? createReplaceValues(environment, runtime) : {};

                if (environmentRuntimeContext.options.rollup.replace) {
                    if (environmentRuntimeContext.options.rollup.replace.values === undefined) {
                        environmentRuntimeContext.options.rollup.replace.values = {};
                    }

                    const existingValues = { ...environmentRuntimeContext.options.rollup.replace.values };

                    // Merge values: default values first, then user-provided values override them
                    Object.assign(environmentRuntimeContext.options.rollup.replace.values, defaultReplaceValues, existingValues);
                } else {
                    context.logger.warn("'replace' plugin is disabled. You should enable it to replace 'process.env.*' environments.");
                }

                const replaceValues = environmentRuntimeContext.options.rollup.replace?.values || defaultReplaceValues;

                const subDirectory = createSubDirectory(environment, runtime);
                // Note: fileAlias is handled separately in prepareEntries, not in subDirectory

                // Determine minify setting based on environment and explicit config
                let minify = environmentRuntimeContext.options.minify ?? false;

                if (environment === "development") {
                    minify = false;
                } else if (environment === "production") {
                    minify = true;
                }

                const buildEntries: BuildEntry[] = (entries as EntryWithType[]).map((entry) => {
                    const { environment: env, runtime: rt, ...rest } = entry;

                    return {
                        ...rest,
                        environment: env === "undefined" ? undefined : (env as Environment),
                        runtime: rt === "undefined" ? undefined : (rt as Runtime),
                    } as BuildEntry;
                });

                const esmAndCjsEntries: BuildEntry[] = [];
                const esmEntries: BuildEntry[] = [];
                const cjsEntries: BuildEntry[] = [];
                const dtsEntries: BuildEntry[] = [];

                for (const entry of buildEntries) {
                    const isDeclarationOnlyName = isDeclarationOnlyEntry(entry.name);

                    if (isDeclarationOnlyName) {
                        if (entry.declaration) {
                            dtsEntries.push(entry);
                        }

                        continue;
                    }

                    // Regular entry categorization - entries can have both JS and declaration outputs
                    if (entry.cjs && entry.esm) {
                        esmAndCjsEntries.push(entry);
                    } else if (entry.cjs) {
                        cjsEntries.push(entry);
                    } else if (entry.esm) {
                        esmEntries.push(entry);
                    } else if (entry.declaration) {
                        // Entry with only declaration, no JS builds
                        dtsEntries.push(entry);
                    }
                }

                if (esmAndCjsEntries.length > 0) {
                    const adjustedEsmAndCjsContext = createAdjustedContext(
                        environmentRuntimeContext,
                        true,
                        true,
                        filterDtsEntries(esmAndCjsEntries),
                        minify,
                        replaceValues,
                    );

                    if (!context.options.dtsOnly) {
                        builders.add({
                            context: adjustedEsmAndCjsContext,
                            fileCache,
                            subDirectory,
                        });
                    }

                    if (context.options.declaration) {
                        const typedEntries = esmAndCjsEntries.filter((entry) => entry.declaration);

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
                    const adjustedEsmContext = createAdjustedContext(
                        environmentRuntimeContext,
                        false,
                        true,
                        filterDtsEntries(esmEntries),
                        minify,
                        replaceValues,
                    );

                    if (!context.options.dtsOnly) {
                        builders.add({
                            context: adjustedEsmContext,
                            fileCache,
                            subDirectory,
                        });
                    }

                    if (context.options.declaration) {
                        // Filter entries that have declaration enabled (already filtered out .d entries above)
                        const typedEntries = esmEntries.filter((entry) => entry.declaration);

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
                    const adjustedCjsContext = createAdjustedContext(
                        environmentRuntimeContext,
                        true,
                        false,
                        filterDtsEntries(cjsEntries),
                        minify,
                        replaceValues,
                    );

                    if (!context.options.dtsOnly) {
                        builders.add({
                            context: adjustedCjsContext,
                            fileCache,
                            subDirectory,
                        });
                    }

                    if (context.options.declaration) {
                        // Filter entries that have declaration enabled (already filtered out .d entries above)
                        const typedEntries = cjsEntries.filter((entry) => entry.declaration);

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
                    const adjustedDtsContext = createAdjustedContext(environmentRuntimeContext, false, false, dtsEntries, minify, replaceValues);

                    typeBuilders.add({
                        context: adjustedDtsContext,
                        fileCache,
                        subDirectory,
                    });
                }
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

    const { builders, typeBuilders } = await prepareRollupConfig(context, fileCache);

    // Run JS bundling in parallel (fast and memory-efficient)
    if (builders.size > 0) {
        await Promise.all(
            [...builders].map(async ({ context: rollupContext, fileCache: cache, subDirectory }) => await rollupBuild(rollupContext, cache, subDirectory)),
        );
    }

    // Run DTS generation with limited concurrency to prevent memory overflow.
    // Each rollup-plugin-dts instance holds TypeScript program state in memory.
    // Limiting concurrency allows V8 to garbage collect between builds.
    if (typeBuilders.size > 0) {
        await runWithConcurrency(
            [...typeBuilders].map(
                ({ context: rollupContext, fileCache: cache, subDirectory }) =>
                    () =>
                        rollupBuildTypes(rollupContext, cache, subDirectory),
            ),
            DEFAULT_DTS_CONCURRENCY,
        );
    }

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

    return showSizeInformation(context.logger, context);
};

export default build;
