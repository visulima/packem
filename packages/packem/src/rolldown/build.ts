import { build as rolldownBuild } from "rolldown";
import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import type { RollupBuild } from "rollup";

import { getRollupOptions } from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";

// Minimal rolldown adapter using Rollup-compatible options
const build = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _subDirectory: string,
): Promise<void> => {
    // subDirectory currently unused in rolldown path
    const rollupLikeOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupLikeOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupLikeOptions.input as any).length === 0) {
        return;
    }

    const bundle = await (rolldown as (options: unknown) => Promise<{
        write: (options: unknown) => Promise<{
            output: {
                code?: string;
                dynamicImports?: string[];
                exports?: string[];
                fileName: string;
                imports?: string[];
                isEntry?: boolean;
                modules?: Record<string, { renderedLength: number }>;
                source?: string;
                type: string;
            }[];
        }>;
    }>)(
        rollupLikeOptions as unknown as Record<string, unknown>,
    );

    await context.hooks.callHook("rollup:build", context, bundle as unknown as RollupBuild);

    const assets = new Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>();

    for (const outputOptions of rollupLikeOptions.output as unknown as Record<string, unknown>[]) {
        // eslint-disable-next-line no-await-in-loop
        const result = await bundle.write(outputOptions);
        const output = result.output as {
            code?: string;
            dynamicImports?: string[];
            exports?: string[];
            fileName: string;
            imports?: string[];
            isEntry?: boolean;
            modules?: Record<string, { renderedLength: number }>;
            source?: string;
            type: string;
        }[];

        const outputChunks = output.filter((f) => f.type === "chunk" && f.isEntry);

        for (const entry of outputChunks) {
            context.buildEntries.push({
                chunks: (entry.imports ?? []).filter((index) => outputChunks.find((c) => c.fileName === index)).map((n) => n),
                dynamicImports: entry.dynamicImports ?? [],
                exports: entry.exports ?? [],
                modules: Object.entries(entry.modules ?? {}).map(([id, module_]) => {
                    return {
                        bytes: module_.renderedLength,
                        id,
                    };
                }),
                path: entry.fileName,
                size: {
                    bytes: Buffer.byteLength(entry.code ?? "", "utf8"),
                },
                type: "entry",
            });
        }

        const outputAssets = output.filter((f) => f.type === "asset");

        for (const entry of outputAssets) {
            if (assets.has(entry.fileName)) {
                continue;
            }

            assets.set(entry.fileName, {
                path: entry.fileName,
                size: {
                    bytes: Buffer.byteLength((entry.source as string) ?? "", "utf8"),
                },
                type: "asset",
            });
        }
    }

    context.buildEntries.push(...assets.values());
};

export default build;
