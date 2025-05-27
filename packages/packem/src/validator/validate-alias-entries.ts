import type { Alias } from "@rollup/plugin-alias";
import { isAccessibleSync } from "@visulima/fs";
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

// eslint-disable-next-line sonarjs/cognitive-complexity
const validateAliasEntries = (entries: ReadonlyArray<Alias> | Record<string, string>): void => {
    if (!Array.isArray(entries) && entries !== undefined) {
        for (const [alias, target] of Object.entries(entries)) {
            if (typeof alias !== "string" || alias.trim() === "") {
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
        }
    }
};

export default validateAliasEntries;
