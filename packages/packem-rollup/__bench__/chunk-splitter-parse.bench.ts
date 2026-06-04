import type { ModuleInfo, PluginContext } from "rollup";
import { parseAst } from "rollup/parseAst";
import { bench, describe } from "vitest";

import gatherExports from "../src/plugins/chunk-splitter/gather";
import parseExports from "../src/plugins/chunk-splitter/parse";
import type { ParsedExportInfo } from "../src/plugins/chunk-splitter/parse/types";

/**
 * Benchmarks the chunk-splitter hot path: parsing the export surface of modules
 * reachable through barrel re-export chains.
 *
 * The optimization memoizes the parsed export list per module id (a
 * `Map<id, ParsedExportInfo[]>` threaded through the gather), so a shared module
 * reachable through many re-export paths within a single run is parsed once
 * instead of once-per-path.
 *
 * The fixture builds a real in-run diamond: one top barrel re-exports several
 * "mid" barrels, and every mid barrel re-exports the SAME set of shared leaf
 * modules. Traversing the top barrel therefore reaches each shared leaf through
 * every mid barrel — exactly the case where the memo collapses redundant parses.
 */

const MID_BARREL_COUNT = 8; // number of paths each shared leaf is reachable through
const SHARED_LEAF_COUNT = 40;

const modules = new Map<string, ModuleInfo>();

const addModule = (id: string, code: string): ModuleInfo => {
    const moduleInfo = { code, id } as ModuleInfo;

    modules.set(id, moduleInfo);

    return moduleInfo;
};

// Shared leaves, each exporting one symbol.
const sharedLeafIds: string[] = [];

for (let index = 0; index < SHARED_LEAF_COUNT; index += 1) {
    const id = `/shared/leaf-${index}.js`;

    addModule(id, `export const value${index} = ${index};`);
    sharedLeafIds.push(id);
}

// Mid barrels, each re-exporting ALL shared leaves.
const sharedReExports = sharedLeafIds.map((id) => `export * from "${id}";`).join("\n");
const midBarrelIds: string[] = [];

for (let index = 0; index < MID_BARREL_COUNT; index += 1) {
    const id = `/mid/barrel-${index}.js`;

    addModule(id, sharedReExports);
    midBarrelIds.push(id);
}

// Top barrel re-exporting every mid barrel -> shared leaves form a diamond.
const topBarrel = addModule("/top/index.js", midBarrelIds.map((id) => `export * from "${id}";`).join("\n"));

const buildContext = (parse: PluginContext["parse"]): PluginContext =>
    ({
        load: async (resolved: { id: string }) => modules.get(resolved.id),
        parse,
        resolve: async (source: string) => ({ external: false, id: source }),
    }) as unknown as PluginContext;

const drain = async (iterable: AsyncGenerator<unknown>): Promise<void> => {
    // eslint-disable-next-line no-empty
    for await (const _ of iterable) {
    }
};

describe("chunk-splitter parseExports memoization (barrel diamond)", () => {
    const context = buildContext(parseAst);

    bench("optimized: memoized parse (shared module parsed once)", () => {
        const cache = new Map<string, ParsedExportInfo[]>();

        // Each shared leaf is reached through every mid barrel: simulate the
        // diamond by parsing each leaf once per path, but with the per-id memo.
        for (let path = 0; path < MID_BARREL_COUNT; path += 1) {
            for (const id of sharedLeafIds) {
                parseExports(context, modules.get(id) as ModuleInfo, cache);
            }
        }
    });

    bench("baseline: no memo (re-parse on every path)", () => {
        // Same traversal, but no cache -> each shared leaf is re-parsed on every
        // path (MID_BARREL_COUNT times), reproducing the pre-optimization cost.
        for (let path = 0; path < MID_BARREL_COUNT; path += 1) {
            for (const id of sharedLeafIds) {
                parseExports(context, modules.get(id) as ModuleInfo);
            }
        }
    });
});

describe("chunk-splitter gatherExports end-to-end (barrel diamond)", () => {
    bench("optimized: full gather over diamond barrel", async () => {
        const context = buildContext(parseAst);

        await drain(gatherExports(context, topBarrel));
    });
});
