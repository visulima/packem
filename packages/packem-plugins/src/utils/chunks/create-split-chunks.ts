/* eslint-disable no-secrets/no-secrets */

/**
 * Modified copy of https://github.com/huozhi/bunchee/blob/3cb85160bbad3af229654cc09d6fcd67120fe8bd/src/lib/split-chunk.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/bunchee/graphs/contributors
 */
import type { BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import { memoize } from "@visulima/packem-share/utils";
import { basename, extname } from "@visulima/path";
import type { GetManualChunk, GetModuleInfo } from "rollup";

import getCustomModuleLayer from "./get-custom-module-layer";
import getModuleLayer from "./get-module-layer";

const SWC_HELPERS_RE = /[\\/]node_modules[\\/]@swc[\\/]helper/;

const hashTo3Char = memoize((input: string): string => {
    let hash = 0;

    for (let index = 0; index < input.length; index += 1) {
        // eslint-disable-next-line no-bitwise
        hash = (hash << 5) - hash + (input.codePointAt(index) as number); // Simple hash shift
    }

    // eslint-disable-next-line no-bitwise
    return (hash >>> 0).toString(36).slice(0, 3); // Base36 + trim to 3 chars
});

/**
 * Get the effective layer of a module by walking up the importer chain.
 * A module inherits the layer of its importer if it doesn't have its own layer.
 *
 * Results are memoized in `cache` (keyed by module id) for the lifetime of a
 * single build. A module's effective layer is a stable property of the module
 * graph, but without memoization this is called for every importer of every
 * module and re-walks the full importer ancestry each time — O(n²) on large
 * graphs, and pure waste on the common build that uses no layers at all (every
 * walk returns `undefined`). Caching collapses it to O(n).
 */
const getEffectiveModuleLayer = (
    id: string,
    getModuleInfo: GetModuleInfo,
    cache: Map<string, string | undefined>,
    visited: Set<string> = new Set(),
): string | undefined => {
    if (cache.has(id)) {
        return cache.get(id);
    }

    if (visited.has(id)) {
        // Cycle guard: a back-edge can't determine the layer. Return without
        // caching — the true result for `id` is computed by its own top-level walk.
        return undefined;
    }

    visited.add(id);

    const moduleInfo = getModuleInfo(id);

    if (!moduleInfo) {
        return undefined;
    }

    // If this module has its own layer, return it
    const ownLayer = getModuleLayer(moduleInfo.meta);

    if (ownLayer) {
        cache.set(id, ownLayer);

        return ownLayer;
    }

    // Otherwise, inherit layer from importers
    let result: string | undefined;

    for (const importerId of moduleInfo.importers) {
        const importerLayer = getEffectiveModuleLayer(importerId, getModuleInfo, cache, visited);

        if (importerLayer) {
            result = importerLayer;

            break;
        }
    }

    cache.set(id, result);

    return result;
};

/**
 * Check if a module is imported by modules with different boundary layers.
 * Returns the set of unique layers if there are multiple, otherwise undefined.
 */
const getImporterLayers = (id: string, getModuleInfo: GetModuleInfo, layerCache: Map<string, string | undefined>): Set<string> => {
    const moduleInfo = getModuleInfo(id);

    if (!moduleInfo) {
        return new Set();
    }

    const layers = new Set<string>();

    for (const importerId of moduleInfo.importers) {
        const importerInfo = getModuleInfo(importerId);

        if (!importerInfo) {
            continue;
        }

        // Get the importer's own layer first
        const importerOwnLayer = getModuleLayer(importerInfo.meta);

        if (importerOwnLayer) {
            layers.add(importerOwnLayer);
        } else {
            // If the importer doesn't have a layer, get its effective layer
            const effectiveLayer = getEffectiveModuleLayer(importerId, getModuleInfo, layerCache, new Set([id]));

            if (effectiveLayer) {
                layers.add(effectiveLayer);
            }
        }
    }

    return layers;
};

const createSplitChunks = (
    dependencyGraphMap: Map<string, Set<[string, string]>>,
    entryFiles: (BuildContextBuildAssetAndChunk | BuildContextBuildEntry)[],
    // Whether directive-based module layers can exist in this build (the
    // preserve-directives plugin is active). When false, `getModuleLayer` always
    // returns undefined, so every layer-driven branch below is dead work — most
    // importantly the per-module `getImporterLayers` importer-graph walk.
    layersEnabled = true,
): GetManualChunk => {
    // If there's existing chunk being separated, and contains a layer { <id>: <chunkGroup> }
    const splitChunksGroupMap = new Map<string, string>();

    // Memoizes each module's effective layer for this build, shared across every
    // `getImporterLayers` call so the importer-ancestry walk runs once per module
    // (O(n)) instead of once per importer-edge (O(n²)).
    const effectiveLayerCache = new Map<string, string | undefined>();

    // eslint-disable-next-line sonarjs/cognitive-complexity
    return function splitChunks(id, context) {
        if (SWC_HELPERS_RE.test(id)) {
            return "cc"; // common chunk
        }

        const moduleInfo = context.getModuleInfo(id);

        if (!moduleInfo) {
            return undefined;
        }

        const { isEntry } = moduleInfo;
        const moduleMeta = moduleInfo.meta;
        let moduleLayer = getModuleLayer(moduleMeta);

        if (moduleLayer) {
            moduleLayer = hashTo3Char(moduleLayer);
        }

        if (!isEntry) {
            const cachedCustomModuleLayer = splitChunksGroupMap.get(id);

            if (cachedCustomModuleLayer) {
                return cachedCustomModuleLayer;
            }

            const customModuleLayer = getCustomModuleLayer(id);

            if (customModuleLayer) {
                splitChunksGroupMap.set(id, customModuleLayer);

                return customModuleLayer;
            }
        }

        // Collect the sub modules of the entry, if they're having layer, and the same layer with the entry, push them to the dependencyGraphMap.
        // This only ever records anything when the entry itself has a layer (the
        // inner guard requires `moduleLayer && subModuleLayer === moduleLayer`), so
        // skip the whole-graph walk and per-submodule `getModuleInfo` scan — by far
        // the bulk of the remaining cost — for layerless entries (the common case).
        if (isEntry && moduleLayer) {
            const subModuleIds: Iterable<string>
                // Rollup exposes `getModuleIds()` returning every module in the build.
                // Rolldown's `manualChunks` context only exposes `getModuleInfo`, so we
                // fall back to a graph walk from the entry via `importedIds`.
                = typeof (context as { getModuleIds?: () => Iterable<string> }).getModuleIds === "function"
                    ? (context as { getModuleIds: () => Iterable<string> }).getModuleIds()
                    : (() => {
                        const visited = new Set<string>();
                        const stack: string[] = [id];

                        while (stack.length > 0) {
                            const current = stack.pop() as string;

                            if (visited.has(current)) {
                                continue;
                            }

                            visited.add(current);

                            const info = context.getModuleInfo(current);

                            if (!info) {
                                continue;
                            }

                            for (const next of info.importedIds) {
                                if (!visited.has(next)) {
                                    stack.push(next);
                                }
                            }
                        }

                        return visited;
                    })();

            for (const subId of subModuleIds) {
                const subModuleInfo = context.getModuleInfo(subId);

                if (!subModuleInfo) {
                    continue;
                }

                const subModuleLayer = getModuleLayer(subModuleInfo.meta);

                // `moduleLayer` is guaranteed truthy here (the enclosing `isEntry`
                // block is only entered when it is set).
                if (subModuleLayer === moduleLayer) {
                    if (!dependencyGraphMap.has(subId)) {
                        dependencyGraphMap.set(subId, new Set());
                    }

                    (dependencyGraphMap.get(subId) as Set<[string, string]>).add([id, moduleLayer]);
                }
            }
        }

        // Check if this module (without its own directive) is imported by multiple boundaries.
        // If so, split it into a separate shared chunk to prevent boundary crossing issues.
        // Skipped entirely when layers can't exist: `getImporterLayers` would walk the
        // importer graph (a per-edge `getModuleInfo` scan) only to find no layers.
        if (layersEnabled && !moduleLayer && !isEntry) {
            const importerLayers = getImporterLayers(id, context.getModuleInfo, effectiveLayerCache);

            // If this module is imported by modules with different layers (e.g., both client and server),
            // split it into a separate chunk that can be safely imported by both boundaries.
            if (importerLayers.size > 1) {
                if (splitChunksGroupMap.has(id)) {
                    return splitChunksGroupMap.get(id);
                }

                const chunkName = basename(id, extname(id));
                // Create a unique suffix based on all the layers that import this module
                const layersSuffix = [...importerLayers].toSorted((a, b) => a.localeCompare(b)).join("-");
                const chunkGroup = `${chunkName}-${hashTo3Char(layersSuffix)}`;

                splitChunksGroupMap.set(id, chunkGroup);

                return chunkGroup;
            }
        }

        // If current module has a layer, and it's not an entry
        if (
            moduleLayer
            && !isEntry // If the module is imported by the entry:
            // when the module layer is same as entry layer, keep it as part of entry and don't split it;
            // when the module layer is different from entry layer, split the module into a separate chunk as a separate boundary.
            && dependencyGraphMap.has(id)
        ) {
            const parentModuleIds = [...(dependencyGraphMap.get(id) as Set<[string, string]>)];
            const isImportFromOtherEntry = parentModuleIds.some(([pid]) => {
                // If other entry is dependency of this entry
                if (entryFiles.some((entry) => entry.path === pid)) {
                    const entryModuleInfo = context.getModuleInfo(pid);
                    const entryModuleLayer = getModuleLayer(entryModuleInfo ? entryModuleInfo.meta : {});

                    return entryModuleLayer === moduleLayer;
                }

                return false;
            });

            if (isImportFromOtherEntry) {
                return undefined;
            }

            const isPartOfCurrentEntry = parentModuleIds.every(([, layer]) => layer === moduleLayer);

            if (isPartOfCurrentEntry) {
                if (splitChunksGroupMap.has(id)) {
                    return splitChunksGroupMap.get(id);
                }

                return undefined;
            }

            const chunkName = basename(id, extname(id));
            const layerSuffix = hashTo3Char(moduleLayer);
            const chunkGroup = `${chunkName}-${layerSuffix}`;

            splitChunksGroupMap.set(id, chunkGroup);

            return chunkGroup;
        }

        return undefined;
    };
};

export default createSplitChunks;
