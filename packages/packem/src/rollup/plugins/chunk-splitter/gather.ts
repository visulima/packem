/**
 * Modified copy of https://github.com/cprecioso/rollup-plugin-chunk-per-export/blob/main/src/gather
 */
import assert from "node:assert/strict";

import type { ModuleInfo, PluginContext } from "rollup";

import parseExports from "./parse";
import type { BarrelReExport, ExportBinding, NamedReExport, NamedSelfExport } from "./parse/types";

interface ExportInfo {
    exportedName: string;
    id: string;
    sourceName: string;
}

const getImportedModule = async function (context: PluginContext, source: string, importer: ModuleInfo) {
    const importedId = await context.resolve(source, importer.id);

    assert(importedId, `Rollup can't resolve ${source} from ${importer.id}`);

    if (importedId.external) {
        return null;
    }

    const importedModule = await context.load(importedId);

    assert(importedModule, `Rollup doesn't have a module for id ${importedId.id}`);

    return importedModule;
};

const gatherBarrelReExports = async function* (context: PluginContext, reexported: BarrelReExport, module_: ModuleInfo): AsyncGenerator<ExportInfo> {
    const importedModule = await getImportedModule(context, reexported.source, module_);
    if (!importedModule) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    yield* gatherExports(context, importedModule);
};

const gatherNamedReExports = async function* (context: PluginContext, reexported: NamedReExport, module_: ModuleInfo): AsyncGenerator<ExportInfo> {
    const importedModule = await getImportedModule(context, reexported.source, module_);
    if (!importedModule) {
        return;
    }

    const bindingsByImportedName = new Map<string, ExportBinding>(reexported.bindings.map((binding) => [binding.importedName, binding]));

    // eslint-disable-next-line @typescript-eslint/no-use-before-define,no-loops/no-loops,no-restricted-syntax
    for await (const exportInfo of gatherExports(context, importedModule)) {
        const binding = bindingsByImportedName.get(exportInfo.exportedName);

        if (!binding) {
            // eslint-disable-next-line no-continue
            continue;
        }

        yield { ...exportInfo, exportedName: binding.exportedName };
    }
};

const gatherNamedSelfExports = async function* (module_: ModuleInfo, exported: NamedSelfExport): AsyncGenerator<ExportInfo> {
    yield {
        exportedName: exported.exportedName,
        id: module_.id,
        sourceName: exported.exportedName,
    };
};

const gatherExports = async function* (context: PluginContext, module_: ModuleInfo): AsyncGenerator<ExportInfo> {
    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const exported of parseExports(context, module_)) {
        if (exported.from === "self") {
            yield* gatherNamedSelfExports(module_, exported);
        } else if (exported.type === "barrel") {
            yield* gatherBarrelReExports(context, exported, module_);
        } else {
            yield* gatherNamedReExports(context, exported, module_);
        }
    }
};

export default gatherExports;
