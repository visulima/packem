/**
 * Modified copy of https://github.com/cprecioso/rollup-plugin-chunk-per-export/blob/main/src/gather
 */
import assert from "node:assert/strict";

import type { ModuleInfo, PluginContext } from "rollup";

import parseExports from "./parse";
import type { BarrelReExport, ExportBinding, NamedReExport, NamedSelfExport, ParsedExportInfo } from "./parse/types";

interface ExportInfo {
    exportedName: string;
    id: string;
    sourceName: string;
}

/**
 * State threaded through the recursive gather to keep traversal correct and
 * cheap across re-export chains:
 * - `visited` is the set of module ids currently on the recursion path. It
 *   guards against circular barrel re-exports (e.g. a -> b -> a), which are
 *   legal input that rollup itself tolerates; without it the mutual recursion
 *   is unbounded. Ids are removed when their subtree finishes so legitimate
 *   diamond re-exports through sibling statements are still fully traversed.
 * - `parseCache` memoizes the (expensive) parse of each module's source so a
 *   shared barrel reachable through many paths is parsed at most once per run.
 */
interface GatherState {
    parseCache: Map<string, ParsedExportInfo[]>;
    visited: Set<string>;
}

const getImportedModule = async function (context: PluginContext, source: string, importer: ModuleInfo) {
    const importedId = await context.resolve(source, importer.id);

    assert.ok(importedId, `Rollup can't resolve ${source} from ${importer.id}`);

    if (importedId.external) {
        return undefined;
    }

    const importedModule = await context.load(importedId);

    assert.ok(importedModule, `Rollup doesn't have a module for id ${importedId.id}`);

    return importedModule;
};

const gatherBarrelReExports = async function* (context: PluginContext, reexported: BarrelReExport, module_: ModuleInfo, state: GatherState): AsyncGenerator<ExportInfo> {
    const importedModule = await getImportedModule(context, reexported.source, module_);

    if (!importedModule) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    yield* gatherExportsWithState(context, importedModule, state);
};

const gatherNamedReExports = async function* (context: PluginContext, reexported: NamedReExport, module_: ModuleInfo, state: GatherState): AsyncGenerator<ExportInfo> {
    const importedModule = await getImportedModule(context, reexported.source, module_);

    if (!importedModule) {
        return;
    }

    const bindingsByImportedName = new Map<string, ExportBinding>(reexported.bindings.map((binding) => [binding.importedName, binding]));

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    for await (const exportInfo of gatherExportsWithState(context, importedModule, state)) {
        const binding = bindingsByImportedName.get(exportInfo.exportedName);

        if (!binding) {
            continue;
        }

        yield { ...exportInfo, exportedName: binding.exportedName };
    }
};

const gatherNamedSelfExports = function* (module_: ModuleInfo, exported: NamedSelfExport): Generator<ExportInfo> {
    yield {
        exportedName: exported.exportedName,
        id: module_.id,
        sourceName: exported.exportedName,
    };
};

const gatherExportsWithState = async function* (context: PluginContext, module_: ModuleInfo, state: GatherState): AsyncGenerator<ExportInfo> {
    // Cycle guard: only skip a module that is an *ancestor* on the current
    // recursion path (a circular barrel a -> b -> a). The id is removed from the
    // path on the way out so legitimate diamond re-exports — the same module
    // reached again through a sibling re-export statement — are still fully
    // traversed (otherwise we'd silently drop their exports).
    if (state.visited.has(module_.id)) {
        return;
    }

    state.visited.add(module_.id);

    try {
        for (const exported of parseExports(context, module_, state.parseCache)) {
            if (exported.from === "self") {
                yield* gatherNamedSelfExports(module_, exported);
            } else if (exported.type === "barrel") {
                yield* gatherBarrelReExports(context, exported, module_, state);
            } else {
                yield* gatherNamedReExports(context, exported, module_, state);
            }
        }
    } finally {
        state.visited.delete(module_.id);
    }
};

const gatherExports = function (context: PluginContext, module_: ModuleInfo): AsyncGenerator<ExportInfo> {
    return gatherExportsWithState(context, module_, { parseCache: new Map<string, ParsedExportInfo[]>(), visited: new Set<string>() });
};

export default gatherExports;
