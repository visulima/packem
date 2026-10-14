import { readFile } from "node:fs/promises";
import path from "node:path";

import { walk } from "yuku-ast";
import type { Comment, Program, ProgramStatement } from "yuku-parser";
import { parse } from "yuku-parser";

import { RE_NODE_MODULES } from "./filename";

// `path="..."` (or single-quoted) attribute of a reference path directive.
const REFERENCE_PATH_RE = /\/\s*<reference\s+path=(["'])(.+?)\1/u;

// Any triple-slash directive. `comment.value` has its `//` delimiter stripped, so the leading `/` remains.
const TRIPLE_SLASH_RE = /^\/\s*<reference\s/u;

// Statements that make a file a module, as an import or export of any kind.
const MODULE_STATEMENT_RE = /^(?:Import|Export|TSImportEquals|TSExportAssignment|TSNamespaceExport)/u;

// Declarations a global script may hold. Anything else (statements, side effects) is not inlined.
const SCRIPT_STATEMENT_TYPES = new Set<string>([
    "ClassDeclaration",
    "FunctionDeclaration",
    "TSDeclareFunction",
    "TSEnumDeclaration",
    "TSInterfaceDeclaration",
    "TSModuleDeclaration",
    "TSTypeAliasDeclaration",
    "VariableDeclaration",
]);

const isScriptStatement = (node: ProgramStatement): boolean => {
    if (!SCRIPT_STATEMENT_TYPES.has(node.type)) return false;

    // `declare module "x" {}` is a module augmentation: it cannot be nested in `declare global`.
    return !(node.type === "TSModuleDeclaration" && node.id.type === "Literal");
};

const isModuleStatement = (node: ProgramStatement): boolean => MODULE_STATEMENT_RE.test(node.type);

const containsImportType = (program: Program): boolean => {
    let found = false;

    walk(program, {
        enter(node) {
            if (node.type === "TSImportType") found = true;
        },
    });

    return found;
};

export interface InlinableScript {
    /** Absolute path of the referenced file, the dedupe key. */
    file: string;
    statements: ProgramStatement[];
}

/**
 * Loads the file a reference path directive points at when it is a local global script: a file
 * with only declarations, no imports or exports and no directives of its own. Returns `undefined`
 * for anything else, so the caller keeps the directive as it is.
 */
export const loadReferencedScript = async (directive: Comment, sourceFile: string): Promise<InlinableScript | undefined> => {
    const match = REFERENCE_PATH_RE.exec(directive.value);

    if (!match) return undefined;

    const file = path.resolve(path.dirname(sourceFile), match[2]);

    if (RE_NODE_MODULES.test(file)) return undefined;

    let code: string;

    try {
        code = await readFile(file, "utf8");
    } catch {
        return undefined;
    }

    let parsed: ReturnType<typeof parse>;

    try {
        parsed = parse(code, { attachComments: true, lang: "dts", sourceType: "module" });
    } catch {
        return undefined;
    }

    const { comments, diagnostics, program } = parsed;

    if (diagnostics.length > 0 || comments.some((comment) => TRIPLE_SLASH_RE.test(comment.value))) return undefined;

    // An `import("./x")` type would point at a path that no longer exists once the declarations move.
    if (program.body.some((node) => !isScriptStatement(node)) || containsImportType(program)) return undefined;

    return { file, statements: program.body };
};

/**
 * Appends the declarations of the inlined scripts to a chunk's program. In a module output they are
 * wrapped in `declare global { … }` so they stay global, and `declare` is dropped inside that wrapper
 * (it is already an ambient context). In a script output they are appended as they are.
 */
export const appendInlinedScripts = (program: Program, scripts: InlinableScript[], sourcemap: boolean): void => {
    if (scripts.length === 0) return;

    const isModule = program.body.some((node) => isModuleStatement(node));

    // Clone: the parsed nodes are shared by every chunk and render that inlines the script.
    const declarations = scripts.flatMap(({ statements }) =>
        statements.map((statement) => {
            const copy = structuredClone(statement);

            if (isModule && "declare" in copy) copy.declare = false;

            return copy;
        }),
    );

    let appended: ProgramStatement[] = declarations;

    if (isModule) {
        const [wrapper] = parse("declare global {}", { lang: "dts", sourceType: "module" }).program.body;

        if (wrapper.type === "TSModuleDeclaration" && wrapper.body) {
            wrapper.body.body = declarations;
        }

        appended = [wrapper];
    }

    // The clones carry positions of the referenced file, not of the chunk, so the output map must not use them.
    if (sourcemap) {
        for (const root of appended) {
            walk(root, {
                enter(node) {
                    Object.assign(node, { end: undefined, start: undefined });
                },
            });
        }
    }

    program.body.push(...appended);
};
