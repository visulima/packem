import type { FileCache } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import { getChunkFilename, getDtsExtension } from "@visulima/packem-share/utils";
import { resolve } from "@visulima/path";
import type { Plugin, RollupCache } from "rollup";
import { rollup } from "rollup";

import type { BuildEntry, InternalBuildOptions } from "../types";
import { getRollupDtsOptions } from "./get-rollup-options";

const DTS_CACHE_KEY = "rollup-dts.json";
const SKIP_CHUNK_PREFIX = "__packem_skip__/";

type DtsExtension = "d.cts" | "d.mts" | "d.ts";

/**
 * Compute the set of declaration extensions to emit for one entry.
 *
 * UNION of two sources:
 * - Global-flag-derived: `emitCJS` → `.d.cts`, `emitESM` → `.d.mts`, `compatible`
 *   → `.d.ts`. This is the legacy path: packages without an `exports` map (just
 *   top-level `main`/`module`/`types`) still expect all three files for a
 *   dual-format package, even though only one is explicitly referenced.
 * - `entry.declarationExtensions` (populated by infer-entries from package.json's
 *   exports map): exact extensions that specific conditions reference. This adds
 *   any extension the global logic would miss because of per-entry context
 *   narrowing — e.g. the ESM-only per-entry context for an environment-specific
 *   entry whose `types` is `.d.mts` would otherwise drop to `.d.ts` via
 *   `getDtsExtension`.
 *
 * The union preserves legacy "emit all for dual-format" behavior AND adds
 * extensions that package.json explicitly references, so exports-map-driven
 * packages (like colorize) get exactly what consumers resolve without breaking
 * tests whose fixtures rely on `main`/`module`/`types` alone.
 */
const resolveEntryExtensions = (entry: BuildEntry, context: BuildContext<InternalBuildOptions>): Set<DtsExtension> => {
    const result = new Set<DtsExtension>();

    if (context.options.emitCJS) {
        result.add(getDtsExtension(context, "cjs") as DtsExtension);
    }

    if (context.options.emitESM) {
        result.add(getDtsExtension(context, "esm") as DtsExtension);
    }

    if (context.options.declaration === true || context.options.declaration === "compatible") {
        result.add("d.ts");
    }

    if (entry.declarationExtensions) {
        for (const extension of entry.declarationExtensions) {
            result.add(extension);
        }
    }

    return result;
};

const buildTypes = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string): Promise<void> => {
    const rollupTypeOptions = await getRollupDtsOptions(context, fileCache);

    await context.hooks.callHook("rollup:dts:options", context, rollupTypeOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupTypeOptions.input as any).length === 0) {
        return;
    }

    rollupTypeOptions.cache = fileCache.get<RollupCache>(DTS_CACHE_KEY, subDirectory);

    const typesBuild = await rollup(rollupTypeOptions);

    try {
        fileCache.set(DTS_CACHE_KEY, typesBuild.cache, subDirectory);

        await context.hooks.callHook("rollup:dts:build", context, typesBuild);

        context.logger.info({
            message: "Building declaration files...",
            prefix: "dts",
        });

        // Build a lookup from rollup entry name to BuildEntry so the per-write
        // entryFileNames function can decide, per chunk, whether to emit the file.
        const entriesByName = new Map<string, BuildEntry>();

        for (const entry of context.options.entries) {
            if (entry.name) {
                entriesByName.set(entry.name, entry);
            }
        }

        // Union of extensions any entry wants. Each element becomes one `write()` pass.
        // Without per-entry data this collapses to the previous behavior (CJS → ESM → compat).
        const allExtensions = new Set<DtsExtension>();

        for (const entry of context.options.entries) {
            for (const extension of resolveEntryExtensions(entry, context)) {
                allExtensions.add(extension);
            }
        }

        const outDir = resolve(context.options.rootDir, context.options.outDir);

        // Plugin that strips chunks routed to SKIP_CHUNK_PREFIX by entryFileNames.
        // Rollup's `entryFileNames` must return a string; we use a sentinel path to mark
        // entries that shouldn't be emitted for the current extension, then drop them
        // in generateBundle so nothing lands in the output dir.
        const filterSkipChunksPlugin: Plugin = {
            generateBundle(_options, bundle) {
                for (const fileName of Object.keys(bundle)) {
                    if (fileName.startsWith(SKIP_CHUNK_PREFIX)) {
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                        delete bundle[fileName];
                    }
                }
            },
            name: "packem:filter-skip-chunks",
        };

        for (const extension of allExtensions) {
            // eslint-disable-next-line no-await-in-loop
            await typesBuild.write({
                chunkFileNames: (chunk) => getChunkFilename(chunk, extension),
                dir: outDir,
                entryFileNames: (chunk) => {
                    // The DTS plugin emits two chunks per entry: the real entry
                    // (chunk.name === entry.name) and a `.d`-suffixed helper
                    // (chunk.name === entry.name + ".d"). Both need filtering.
                    const entryName = chunk.name?.endsWith(".d") ? chunk.name.slice(0, -2) : chunk.name;
                    const entry = entryName ? entriesByName.get(entryName) : undefined;

                    if (entry) {
                        const wanted = resolveEntryExtensions(entry, context);

                        if (!wanted.has(extension)) {
                            return `${SKIP_CHUNK_PREFIX}[name].${extension}`;
                        }
                    }

                    return `[name].${extension}`;
                },
                plugins: [filterSkipChunksPlugin],
            });
        }

        await context.hooks.callHook("rollup:dts:done", context);
    } finally {
        await typesBuild.close();
    }
};

export default buildTypes;
