import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import type { OutputAsset, OutputChunk, OutputOptions, RollupCache } from "rollup";
import { rollup } from "rollup";

import type { InternalBuildOptions } from "../types";
import { getRollupOptions } from "./get-rollup-options";

const BUNDLE_CACHE_KEY = "rollup-build.json";
const DEPENDENCIES_CACHE_KEY = "dependencies-cache.json";

const build = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string): Promise<void> => {
    const rollupOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupOptions.input as any).length === 0) {
        return;
    }

    // Check if we have cached dependencies available
    const hasCachedDependencies
        = context.options.validation
            && context.options.validation.dependencies !== false
            && !!fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

    // Use bundle cache only if we have cached dependencies (to avoid stale cache issues)
    const loadCache = !context.options.validation || context.options.validation.dependencies === false || hasCachedDependencies;

    if (loadCache) {
        rollupOptions.cache = fileCache.get<RollupCache>(BUNDLE_CACHE_KEY, subDirectory);

        // Restore cached dependencies if available
        if (hasCachedDependencies) {
            const cachedDeps = fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

            if (cachedDeps) {
                cachedDeps.used?.forEach((dep) => context.usedDependencies.add(dep));
                cachedDeps.hoisted?.forEach((dep) => context.hoistedDependencies.add(dep));
            }
        }
    }

    const buildResult = await rollup(rollupOptions);

    if (loadCache) {
        fileCache.set(BUNDLE_CACHE_KEY, buildResult.cache, subDirectory);
    }

    // Always cache dependency information when validation is enabled
    if (context.options.validation && context.options.validation.dependencies !== false) {
        fileCache.set(
            DEPENDENCIES_CACHE_KEY,
            {
                hoisted: [...context.hoistedDependencies],
                used: [...context.usedDependencies],
            },
            subDirectory,
        );
    }

    await context.hooks.callHook("rollup:build", context, buildResult);

    const assets = new Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>();

    for (const outputOptions of rollupOptions.output as OutputOptions[]) {
        // eslint-disable-next-line no-await-in-loop
        const { output } = await buildResult.write(outputOptions);
        const outputChunks = output.filter((fOutput) => fOutput.type === "chunk" && fOutput.isEntry) as OutputChunk[];

        for (const entry of outputChunks) {
            context.buildEntries.push({
                chunks: entry.imports.filter((index) => outputChunks.find((c) => c.fileName === index)),
                dynamicImports: entry.dynamicImports,
                exports: entry.exports,
                modules: Object.entries(entry.modules).map(([id, module_]) => {
                    return {
                        bytes: module_.renderedLength,
                        id,
                    };
                }),
                path: entry.fileName,
                size: {
                    bytes: Buffer.byteLength(entry.code, "utf8"),
                },
                type: "entry",
            });
        }

        const outputAssets = output.filter((fOutput) => fOutput.type === "asset") as OutputAsset[];

        for (const entry of outputAssets) {
            if (assets.has(entry.fileName)) {
                continue;
            }

            assets.set(entry.fileName, {
                path: entry.fileName,
                size: {
                    bytes: Buffer.byteLength(entry.source, "utf8"),
                },
                type: "asset",
            });
        }
    }

    context.buildEntries.push(...assets.values());
};

export default build;
