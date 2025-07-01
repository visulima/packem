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

const parseExports = function* (context: PluginContext, module_: ModuleInfo): Generator<ParsedExportInfo> {
    assert.ok(module_.code != undefined, `Module ${module_.id} doesn't have associated code`);
    const node = context.parse(module_.code);

    for (const statement of node.body) {
        switch (statement.type) {
            case "ExportAllDeclaration": {
                yield* parseExportAll(statement);
                break;
            }

            case "ExportDefaultDeclaration": {
                yield* parseExportDefault();
                break;
            }

            case "ExportNamedDeclaration": {
                yield* parseExportNamed(statement);
                break;
            }

            default:
            // do nothing
        }
    }
};

export default parseExports;
