import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";

import type { InternalBuildOptions } from "../types";

/**
 * Bundler-agnostic shape covering both rollup's OutputChunk/OutputAsset
 * and rolldown's equivalent. Fields are optional because the rolldown
 * surface treats most of them as such; rollup outputs always populate
 * them but the broader signature works for both.
 */
export type BuildOutputItem = {
    code?: string;
    dynamicImports?: string[];
    exports?: string[];
    fileName: string;
    imports?: string[];
    isEntry?: boolean;
    modules?: Record<string, { renderedLength: number }>;
    source?: string | Uint8Array;
    type: string;
};

/**
 * Translate a bundler write() result into context.buildEntries records.
 * Shared between the rollup and rolldown drivers.
 */
export const collectBuildEntries = (
    output: BuildOutputItem[],
    context: BuildContext<InternalBuildOptions>,
    assets: Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>,
): void => {
    const outputChunks = output.filter((item) => item.type === "chunk" && item.isEntry);

    for (const entry of outputChunks) {
        context.buildEntries.push({
            chunks: (entry.imports ?? []).filter((id) => outputChunks.some((c) => c.fileName === id)),
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

    for (const entry of output.filter((item) => item.type === "asset")) {
        if (assets.has(entry.fileName)) {
            continue;
        }

        const source = entry.source ?? "";
        const bytes = typeof source === "string" ? Buffer.byteLength(source, "utf8") : source.byteLength;

        assets.set(entry.fileName, {
            path: entry.fileName,
            size: { bytes },
            type: "asset",
        });
    }
};
