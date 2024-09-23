import { stat } from "node:fs/promises";

import { bold, cyan, gray, green } from "@visulima/colorize";
import { walk } from "@visulima/fs";
import { formatBytes } from "@visulima/humanizer";
import type { Pail } from "@visulima/pail";
import { join, relative, resolve } from "@visulima/path";

import rollupBuild from "./rollup/build";
import rollupBuildTypes from "./rollup/build-types";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry, BuildEntry } from "./types";
import type FileCache from "./utils/file-cache";
import groupByKeys from "./utils/group-by-keys";

// eslint-disable-next-line sonarjs/cognitive-complexity
const showSizeInformation = (logger: Pail, context: BuildContext): boolean => {
    const rPath = (p: string) => relative(context.options.rootDir, resolve(context.options.outDir, p));

    let loggedEntries = false;
    const foundDtsEntries: string[] = [];

    const entries = context.buildEntries.filter((bEntry) => bEntry.type === "entry");

    if (entries.length > 0) {
        logger.raw("Entries:\n");

        for (const entry of entries) {
            let totalBytes = entry.bytes ?? 0;

            for (const chunk of entry.chunks ?? []) {
                totalBytes += context.buildEntries.find((bEntry) => bEntry.path === chunk)?.bytes ?? 0;
            }

            let line = `  ${bold(rPath(entry.path))} (${[
                "total size: " + cyan(formatBytes(totalBytes)),
                entry.bytes && "chunk size: " + cyan(formatBytes(entry.bytes)),
            ]
                .filter(Boolean)
                .join(", ")})`;

            line += entry.exports?.length ? "\n  exports: " + gray(entry.exports.join(", ")) : "";

            if (entry.chunks?.length) {
                line += `\n${entry.chunks
                    .map((p) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const chunk = context.buildEntries.find((buildEntry) => buildEntry.path === p) ?? ({} as any);

                        return gray("  └─ " + rPath(p) + bold(chunk.bytes ? " (" + formatBytes(chunk?.bytes) + ")" : ""));
                    })
                    .join("\n")}`;
            }

            if (entry.modules && entry.modules.length > 0) {
                const moduleList = entry.modules
                    .filter((m) => m.id.includes("node_modules"))
                    .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
                    .map((m) => gray("  📦 " + rPath(m.id) + bold(m.bytes ? " (" + formatBytes(m.bytes) + ")" : "")))
                    .join("\n");

                line += moduleList.length > 0 ? "\n  inlined modules:\n" + moduleList : "";
            }

            if (context.options.declaration) {
                let dtsPath = entry.path.replace(/\.js$/, ".d.ts");
                let type = "commonjs";

                if (entry.path.endsWith(".cjs")) {
                    dtsPath = entry.path.replace(/\.cjs$/, ".d.cts");
                } else if (entry.path.endsWith(".mjs")) {
                    type = "module";
                    dtsPath = entry.path.replace(/\.mjs$/, ".d.mts");
                }

                const foundDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));

                if (foundDts) {
                    foundDtsEntries.push(foundDts.path);

                    let foundCompatibleDts: BuildContextBuildEntry | BuildContextBuildAssetAndChunk | undefined;

                    if (!dtsPath.includes(".d.ts")) {
                        dtsPath = (dtsPath as string).replace(".d.c", ".d.");

                        foundCompatibleDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));
                    }

                    if (foundCompatibleDts) {
                        foundDtsEntries.push(foundCompatibleDts.path);

                        line +=
                            type === "commonjs"
                                ? "\n  types:\n" +
                                  [foundDts, foundCompatibleDts]
                                      .map(
                                          (value: BuildContextBuildEntry | BuildContextBuildAssetAndChunk) =>
                                              gray("  └─ ") + bold(rPath(value.path)) + " (total size: " + cyan(formatBytes(value.bytes ?? 0)) + ")",
                                      )
                                      .join("\n")
                                : "\n  types: " + bold(rPath(foundDts.path)) + " (total size: " + cyan(formatBytes(foundDts.bytes ?? 0)) + ")";
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

        for (const asset of context.buildEntries.filter((bEntry) => bEntry.type === "asset")) {
            if (foundDtsEntries.includes(asset.path)) {
                // eslint-disable-next-line no-continue
                continue;
            }

            line += gray("\n  └─ ") + bold(rPath(asset.path)) + " (total size: " + cyan(formatBytes(asset.bytes ?? 0)) + ")";
        }

        line += "\n\n";

        logger.raw(line);
    }

    if (loggedEntries) {
        logger.raw("Σ Total dist size (byte size):", cyan(formatBytes(context.buildEntries.reduce((index, entry) => index + (entry.bytes ?? 0), 0))), "\n");
    }

    return loggedEntries;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const prepareRollupConfig = (context: BuildContext, fileCache: FileCache): Promise<void>[] => {
    const groupedEntries = groupByKeys(context.options.entries, "environment", "runtime");

    const rollups: Promise<void>[] = [];

    for (const [environment, environmentEntries] of Object.entries(groupedEntries)) {
        for (const [runtime, entries] of Object.entries(environmentEntries)) {
            const environmentRuntimeContext = {
                ...context,
            };

            if (!context.options.dtsOnly && (environment !== "undefined" || runtime !== "undefined")) {
                context.logger.info(
                    "Preparing build for " +
                        (environment === "undefined" ? "" : cyan(environment) + " environment" + (runtime === "undefined" ? "" : " with ")) +
                        (runtime === "undefined" ? "" : cyan(runtime) + " runtime"),
                );
            }

            if (environmentRuntimeContext.options.rollup.replace) {
                if (environmentRuntimeContext.options.rollup.replace.values === undefined) {
                    environmentRuntimeContext.options.rollup.replace.values = {};
                }

                if (environment !== "undefined") {
                    environmentRuntimeContext.options.rollup.replace.values = {
                        ...environmentRuntimeContext.options.rollup.replace.values,
                        // hack to make sure, that the replace plugin don't replace the environment
                        [["process", "env", "NODE_ENV"].join(".")]: JSON.stringify(environment),
                    };
                }

                environmentRuntimeContext.options.rollup.replace.values = {
                    ...environmentRuntimeContext.options.rollup.replace.values,
                    [["process", "env", "EdgeRuntime"].join(".")]: JSON.stringify(runtime === "edge-light"),
                };
            } else {
                context.logger.warn("'replace' plugin is disabled. You should enable it to replace 'process.env.*' environments.");
            }

            let subDirectory = "";

            if (environment !== "undefined") {
                subDirectory += environment + "/";
            }

            if (runtime !== "undefined") {
                subDirectory += runtime + "/";
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
                const adjustedEsmAndCjsContext = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: true,
                        emitESM: true,
                        entries: esmAndCjsEntries,
                        minify,
                    },
                };

                if (!context.options.dtsOnly) {
                    rollups.push(rollupBuild(adjustedEsmAndCjsContext, fileCache, subDirectory));
                }

                if (context.options.declaration) {
                    const typedEntries = adjustedEsmAndCjsContext.options.entries.filter((entry) => entry.declaration);

                    if (typedEntries.length > 0) {
                        rollups.push(
                            rollupBuildTypes(
                                {
                                    ...adjustedEsmAndCjsContext,
                                    options: {
                                        ...adjustedEsmAndCjsContext.options,
                                        entries: typedEntries,
                                    },
                                },
                                fileCache,
                                subDirectory,
                            ),
                        );
                    }
                }
            }

            if (esmEntries.length > 0) {
                const adjustedEsmContext = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: false,
                        emitESM: true,
                        entries: esmEntries,
                        minify,
                    },
                };

                if (!context.options.dtsOnly) {
                    rollups.push(rollupBuild(adjustedEsmContext, fileCache, subDirectory));
                }

                if (context.options.declaration) {
                    const typedEntries = adjustedEsmContext.options.entries.filter((entry) => entry.declaration);

                    if (typedEntries.length > 0) {
                        rollups.push(
                            rollupBuildTypes(
                                {
                                    ...adjustedEsmContext,
                                    options: {
                                        ...adjustedEsmContext.options,
                                        entries: typedEntries,
                                    },
                                },
                                fileCache,
                                subDirectory,
                            ),
                        );
                    }
                }
            }

            if (cjsEntries.length > 0) {
                const adjustedCjsContext = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: true,
                        emitESM: false,
                        entries: cjsEntries,
                        minify,
                    },
                };

                if (!context.options.dtsOnly) {
                    rollups.push(rollupBuild(adjustedCjsContext, fileCache, subDirectory));
                }

                if (context.options.declaration) {
                    const typedEntries = adjustedCjsContext.options.entries.filter((entry) => entry.declaration);

                    if (typedEntries.length > 0) {
                        rollups.push(
                            rollupBuildTypes(
                                {
                                    ...adjustedCjsContext,
                                    options: {
                                        ...adjustedCjsContext.options,
                                        entries: typedEntries,
                                    },
                                },
                                fileCache,
                                subDirectory,
                            ),
                        );
                    }
                }
            }

            if (environmentRuntimeContext.options.declaration && dtsEntries.length > 0) {
                const adjustedCjsContext = {
                    ...environmentRuntimeContext,
                    options: {
                        ...environmentRuntimeContext.options,
                        emitCJS: false,
                        emitESM: false,
                        entries: dtsEntries,
                        minify,
                    },
                };

                rollups.push(rollupBuildTypes(adjustedCjsContext, fileCache, subDirectory));
            }
        }
    }

    return rollups.filter(Boolean);
};

const build = async (context: BuildContext, fileCache: FileCache): Promise<boolean> => {
    await context.hooks.callHook("build:before", context);

    await Promise.all(prepareRollupConfig(context, fileCache));

    context.logger.success(green(context.options.name ? "Build succeeded for " + context.options.name : "Build succeeded"));

    // Find all dist files and add missing entries as chunks

    for await (const file of walk(join(context.options.rootDir, context.options.outDir))) {
        let entry = context.buildEntries.find((bEntry) => join(context.options.rootDir, context.options.outDir, bEntry.path) === file.path);

        if (!entry) {
            entry = {
                chunk: true,
                path: file.path,
            };

            context.buildEntries.push(entry);
        }

        if (!entry.bytes) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const awaitedStat = await stat(resolve(context.options.rootDir, context.options.outDir, file.path));

            entry.bytes = awaitedStat.size;
        }
    }

    await context.hooks.callHook("build:done", context);

    return showSizeInformation(context.logger, context);
};

export default build;
