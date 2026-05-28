import { isAccessibleSync } from "@visulima/fs";
import type { Alias } from "@visulima/packem-rollup";
import { resolve } from "@visulima/path";

// eslint-disable-next-line sonarjs/anchor-precedence
const invalidAliasPattern = /^[^a-z_@#~]|[^\w/@#~-]|@\/|#\/|~\//i;
const reservedKeywords = new Set([
    "abstract",
    "await",
    "boolean",
    "break",
    "byte",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "double",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "final",
    "finally",
    "float",
    "for",
    "function",
    "goto",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "int",
    "interface",
    "let",
    "long",
    "native",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "short",
    "static",
    "super",
    "switch",
    "synchronized",
    "this",
    "throw",
    "throws",
    "transient",
    "true",
    "try",
    "typeof",
    "undefined",
    "var",
    "void",
    "volatile",
    "while",
    "with",
    "yield",
]);

const validateAliasEntry = (alias: string, target: string): void => {
    if (alias.trim() === "") {
        throw new Error(`Alias name "${alias}" is invalid. Alias names should be non-empty strings.`);
    }

    if (invalidAliasPattern.test(alias)) {
        throw new Error(
            `Alias name "${alias}" is invalid. Alias names should start with a letter or underscore and only contain letters, numbers, underscores, and dashes.`,
        );
    }

    if (reservedKeywords.has(alias)) {
        throw new Error(`Alias name "${alias}" is a reserved keyword and cannot be used.`);
    }

    const resolvedPath = resolve(target);

    if (!isAccessibleSync(resolvedPath)) {
        throw new Error(`Target path "${resolvedPath}" for alias "${alias}" does not exist.`);
    }
};

const validateAliasEntries = (entries: ReadonlyArray<Alias> | Record<string, string>): void => {
    if (Array.isArray(entries)) {
        return;
    }

    // `Array.isArray` does not narrow the `ReadonlyArray<Alias>` member of the
    // union, but the early return above guarantees the remaining runtime shape
    // is the record form.
    const aliasRecord = entries as Record<string, string>;

    for (const [alias, target] of Object.entries(aliasRecord)) {
        validateAliasEntry(alias, target);
    }
};

export default validateAliasEntries;
