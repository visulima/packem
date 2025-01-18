import type { OutputAsset, OutputChunk, OutputOptions, RollupCache } from "rollup";
import { rollup } from "rollup";

import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "../types";
import type FileCache from "../utils/file-cache";
import { getRollupOptions } from "./get-rollup-options";

const BUNDLE_CACHE_KEY = "rollup-build.json";

// eslint-disable-next-line sonarjs/cognitive-complexity
const build = async (context: BuildContext, fileCache: FileCache, subDirectory: string): Promise<void> => {
    const rollupOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupOptions.input as any).length === 0) {
        return;
    }

    let loadCache = true;

    // TODO: find a way to remove this hack
    // This is a hack to prevent caching when using isolated declarations or css loaders
    if (context.options.rollup.isolatedDeclarations || context.options.isolatedDeclarationTransformer || context.options.rollup.css) {
        loadCache = false;
    }

    if (loadCache) {
        rollupOptions.cache = fileCache.get<RollupCache>(BUNDLE_CACHE_KEY, subDirectory);
    }

    const buildResult = await rollup(rollupOptions);

    if (loadCache) {
        fileCache.set(BUNDLE_CACHE_KEY, buildResult.cache, subDirectory);
    }

    await context.hooks.callHook("rollup:build", context, buildResult);

    const assets = new Map<string, BuildContextBuildEntry | BuildContextBuildAssetAndChunk>();

    for (const outputOptions of rollupOptions.output as OutputOptions[]) {
        // eslint-disable-next-line no-await-in-loop
        const { output } = await buildResult.write(outputOptions);
        const chunkFileNames = new Set<string>();
        const outputChunks = output.filter((fOutput) => fOutput.type === "chunk") as OutputChunk[];

        for (const entry of outputChunks) {
            chunkFileNames.add(entry.fileName);

            for (const id of entry.imports) {
                context.usedImports.add(id);
            }

            if (entry.isEntry) {
                context.buildEntries.push({
                    chunks: entry.imports.filter((index) => outputChunks.find((c) => c.fileName === index)),
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
        }

        const outputAssets = output.filter((fOutput) => fOutput.type === "asset") as OutputAsset[];

        for (const entry of outputAssets) {
            if (assets.has(entry.fileName)) {
                // eslint-disable-next-line no-continue
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

        for (const chunkFileName of chunkFileNames) {
            context.usedImports.delete(chunkFileName);
        }
    }

    context.buildEntries.push(...assets.values());
};

export default build;
