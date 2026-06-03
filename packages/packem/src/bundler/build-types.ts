import type { FileCache } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import { getCacheHash, getChunkFilename, getDtsExtension } from "@visulima/packem-share/utils";
import { resolve } from "@visulima/path";
import type { Plugin, RollupCache } from "rollup";

import { getRollupDtsOptions } from "../rollup/get-rollup-options";
import type { BuildEntry, InternalBuildOptions } from "../types";
import { getRollupBuild } from "./get-rollup";

const DTS_CACHE_KEY = "rollup-dts.json";

/**
 * Minimal structural logger contract. `@visulima/pail`'s shipped `Pail` type
 * re-exports from a non-existent `./pail.d.ts`, so the structural alias below
 * keeps the methods we call fully type-checked without the broken import.
 */
interface Logger {
    info: (payload: { message: string; prefix: string }) => void;
}

const getLogger = (context: BuildContext<InternalBuildOptions>): Logger => context.logger as Logger;

// Each DTS pass emits *all* chunks for *one* extension, but only some entries
// actually want that extension. We can't tell rollup "skip this entry" from
// inside entryFileNames — so we redirect unwanted entries to a synthetic path
// under this prefix, then `filterSkipChunksPlugin` deletes those bundle keys
// in generateBundle before write.
const SKIP_CHUNK_PREFIX = "__packem_skip__/";

type DtsExtension = "d.cts" | "d.mts" | "d.ts";

// Compute the set of declaration extensions to emit for one entry.
//
// UNION of two sources:
// - Global-flag-derived: `emitCJS` → `.d.cts`, `emitESM` → `.d.mts`, `compatible`
//   → `.d.ts`. This is the legacy path: packages without an `exports` map (just
//   top-level `main`/`module`/`types`) still expect all three files for a
//   dual-format package, even though only one is explicitly referenced.
// - `entry.declarationExtensions` (populated by infer-entries from package.json's
//   exports map): exact extensions that specific conditions reference. This adds
//   any extension the global logic would miss because of per-entry context
//   narrowing — e.g. the ESM-only per-entry context for an environment-specific
//   entry whose `types` is `.d.mts` would otherwise drop to `.d.ts` via
//   `getDtsExtension`.
//
// The union preserves legacy "emit all for dual-format" behavior AND adds
// extensions that package.json explicitly references, so exports-map-driven
// packages (like colorize) get exactly what consumers resolve without breaking
// tests whose fixtures rely on `main`/`module`/`types` alone.
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

// DTS is rollup-only because @visulima/rollup-plugin-dts depends on rollup
// option shapes (treeshake.preset, generatedCode.arrowFunctions, compact…)
// that rolldown rejects. The factory parameter keeps the seam visible so the
// caller can swap it once a rolldown-compatible DTS plugin lands.
const buildTypes = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string): Promise<void> => {
    const rollupTypeOptions = await getRollupDtsOptions(context, fileCache);

    await context.hooks.callHook("rollup:dts:options", context, rollupTypeOptions);

    if (Object.keys(rollupTypeOptions.input ?? {}).length === 0) {
        return;
    }

    // Isolate the DTS rollup cache per entry-set, not just per `subDirectory`.
    // Several entry-groups can share a runtime (e.g. the default, browser and
    // development conditions of one package are all `browser`), so they share the
    // same `subDirectory`. `@visulima/rollup-plugin-dts` carries TypeScript program
    // state in its rollup cache; sharing one cache slot across those concurrent
    // builds lets them clobber each other — the default entry's declaration
    // collapses and a sibling's chunk (`index.development.d`) is written in place
    // of the real `index.d.ts`. Keying the cache on the build's entry names gives
    // each DTS build its own slot.
    const dtsCacheNamespace = `${subDirectory}/${getCacheHash(
        context.options.entries
            .map((entry) => entry.name ?? "")
            .filter(Boolean)
            .toSorted((a, b) => a.localeCompare(b))
            .join(","),
    )}`;

    rollupTypeOptions.cache = fileCache.get<RollupCache>(DTS_CACHE_KEY, dtsCacheNamespace);

    const rollup = await getRollupBuild();
    const typesBuild = await rollup(rollupTypeOptions);

    try {
        fileCache.set(DTS_CACHE_KEY, typesBuild.cache, dtsCacheNamespace);

        await context.hooks.callHook("rollup:dts:build", context, typesBuild);

        getLogger(context).info({
            message: "Building declaration files...",
            prefix: "dts",
        });

        const entriesByName = new Map<string, BuildEntry>();

        for (const entry of context.options.entries) {
            if (entry.name) {
                entriesByName.set(entry.name, entry);
            }
        }

        const allExtensions = new Set<DtsExtension>();

        for (const entry of context.options.entries) {
            for (const extension of resolveEntryExtensions(entry, context)) {
                allExtensions.add(extension);
            }
        }

        const outputDirectory = resolve(context.options.rootDir, context.options.outDir);

        const filterSkipChunksPlugin: Plugin = {
            generateBundle(_options, bundle) {
                for (const fileName of Object.keys(bundle)) {
                    if (fileName.startsWith(SKIP_CHUNK_PREFIX)) {
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete, no-param-reassign -- rollup's generateBundle contract requires dropping unwanted chunks by mutating the passed `bundle` object in place; there is no return-value alternative.
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
                dir: outputDirectory,
                entryFileNames: (chunk) => {
                    const entryName = chunk.name.endsWith(".d") ? chunk.name.slice(0, -2) : chunk.name;
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

        // FileCache.set() writes asynchronously; flush the DTS cache (rollup-dts.json)
        // here — mirroring bundler/build.ts for the JS build — so it persists to disk
        // before the process can exit and is available to the next, warm DTS build.
        await fileCache.flush();
    }
};

export default buildTypes;
