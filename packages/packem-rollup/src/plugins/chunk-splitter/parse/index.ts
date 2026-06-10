/**
 * Modified copy of https://github.com/cprecioso/rollup-plugin-chunk-per-export/blob/main/src/parse
 */
import assert from "node:assert/strict";

import { extractAssignedNames } from "@rollup/pluginutils";
import type { ExportAllDeclaration, ExportNamedDeclaration, Identifier } from "estree";
import type { ModuleInfo, PluginContext } from "rollup";

import type { ParsedExportInfo } from "./types";

const exportName = function* (statement: ExportNamedDeclaration): Generator<string> {
    switch (statement.declaration?.type) {
        case "ClassDeclaration":
        case "FunctionDeclaration": {
            const { id } = statement.declaration;

            assert.ok(id, `Expected class/function to have a name`);

            yield id.name;

            break;
        }

        case "VariableDeclaration": {
            for (const declarator of statement.declaration.declarations) {
                for (const name of extractAssignedNames(declarator.id)) {
                    yield name;
                }
            }

            break;
        }

        default:
        // no default
    }
};

const parseExportNamed = function* (statement: ExportNamedDeclaration): Generator<ParsedExportInfo> {
    if (statement.declaration) {
        for (const exportedName of exportName(statement)) {
            yield { exportedName, from: "self", type: "named" };
        }
    } else if (statement.source) {
        yield {
            bindings: statement.specifiers.map((specifier) => {
                return {
                    exportedName: (specifier.exported as Identifier).name,
                    importedName: (specifier.local as Identifier).name,
                };
            }),
            from: "other",
            source: statement.source.value as string,
            type: "named",
        };
    } else {
        for (const specifier of statement.specifiers) {
            yield {
                exportedName: (specifier.exported as Identifier).name,
                from: "self",
                type: "named",
            };
        }
    }
};

const parseExportAll = function* (statement: ExportAllDeclaration): Generator<ParsedExportInfo> {
    if (statement.exported) {
        yield {
            exportedName: (statement.exported as Identifier).name,
            from: "self",
            type: "named",
        };
    } else {
        yield {
            from: "other",
            source: statement.source.value as string,
            type: "barrel",
        };
    }
};

const parseExportDefault = function* (): Generator<ParsedExportInfo> {
    yield { exportedName: "default", from: "self", type: "named" };
};

/**
 * Pick the oxc parser `lang` for a module from its extension.
 *
 * Under rollup the chunk splitter runs in `moduleParsed`, where `module_.code`
 * is already transpiled to plain JS, so `this.parse` (acorn) parses it as JS and
 * this option is ignored. Under rolldown the native oxc transform runs AFTER
 * `moduleParsed`, so `module_.code` is still the raw TS/JSX source — rolldown's
 * `this.parse` is oxc-based and accepts `{ lang }`, so telling it the real
 * dialect lets the splitter read exports off the untranspiled source. The value
 * is harmless under rollup (acorn ignores unknown parse options).
 */
const langForId = (id: string): "js" | "jsx" | "ts" | "tsx" => {
    if (/\.tsx$/.test(id)) {
        return "tsx";
    }

    if (/\.[cm]?ts$/.test(id)) {
        return "ts";
    }

    if (/\.jsx$/.test(id)) {
        return "jsx";
    }

    return "js";
};

const collectExports = function (context: PluginContext, module_: ModuleInfo): ParsedExportInfo[] {
    assert.ok(module_.code !== null, `Module ${module_.id} doesn't have associated code`);

    let node: ReturnType<PluginContext["parse"]>;

    try {
        // `lang` is a rolldown/oxc parse option (see langForId); rollup's acorn
        // parse ignores it and reads the already-transpiled JS.
        node = context.parse(module_.code, { lang: langForId(module_.id) } as Parameters<PluginContext["parse"]>[1]);
    } catch {
        // A module whose source can't be parsed for its export list simply isn't
        // promoted to its own chunk — it stays inlined in its importer, which is
        // the safe, pre-splitter default. Better to skip one module than to fail
        // the whole build.
        return [];
    }

    const result: ParsedExportInfo[] = [];

    for (const statement of node.body) {
        switch (statement.type) {
            case "ExportAllDeclaration": {
                result.push(...parseExportAll(statement));
                break;
            }

            case "ExportDefaultDeclaration": {
                result.push(...parseExportDefault());
                break;
            }

            case "ExportNamedDeclaration": {
                result.push(...parseExportNamed(statement));
                break;
            }

            default:
            // do nothing
        }
    }

    return result;
};

/**
 * Parsing a module's source is the dominant cost of the chunk splitter and is
 * fully redundant on repeat visits of an unchanged module (the same shared
 * barrel is commonly reachable from many entries/re-export paths within one
 * build). Memoize the parsed export list per module id so each module is
 * parsed at most once per build. The cache is keyed by id and lives for the
 * duration of the plugin instance.
 */
const parseExports = function (context: PluginContext, module_: ModuleInfo, cache?: Map<string, ParsedExportInfo[]>): ParsedExportInfo[] {
    if (!cache) {
        return collectExports(context, module_);
    }

    const cached = cache.get(module_.id);

    if (cached !== undefined) {
        return cached;
    }

    const parsed = collectExports(context, module_);

    cache.set(module_.id, parsed);

    return parsed;
};

export default parseExports;
