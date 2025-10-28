/**
 * Modified copy of https://github.com/vitejs/vite/blob/main/packages/vite/rollup.dts.config.ts#L64
 */
import { parse } from "@babel/parser";
// eslint-disable-next-line import/no-extraneous-dependencies
import { walk } from "estree-walker";
import MagicString from "magic-string";
import { findStaticImports } from "mlly";
import type { Plugin, PluginContext, RenderedChunk } from "rollup";

// Taken from https://stackoverflow.com/a/36328890

const multilineCommentsRE = /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g;
const licenseCommentsRE = /MIT License|MIT license|BSD license/;
const consecutiveNewlinesRE = /\n{2,}/g;
const identifierWithTrailingDollarRE = /\b(\w+)\$\d+\b/g;

const escapeRegexRE = /[-/\\^$*+?.()|[\]{}]/g;
const escapeRegex = (string_: string): string => string_.replaceAll(escapeRegexRE, String.raw`\$&`);

const unique = <T>(array: T[]): T[] => [...new Set(array)];

const cleanUnnecessaryComments = (code: string) =>
    code.replaceAll(multilineCommentsRE, (m) => (licenseCommentsRE.test(m) ? "" : m)).replaceAll(consecutiveNewlinesRE, "\n\n");

const calledDtsFiles = new Map<string, boolean>();

/**
 * Rollup deduplicate type names with a trailing `$1` or `$2`, which can be
 * confusing when showed in autocompletions. Try to replace with a better name
 */
// eslint-disable-next-line func-style
function replaceConfusingTypeNames(this: PluginContext, code: string, chunk: RenderedChunk, { identifierReplacements }: PatchTypesOptions, logger: Console) {
    const imports = findStaticImports(code);

    // eslint-disable-next-line guard-for-in
    for (const moduleName in identifierReplacements) {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const imp = imports.find((imp) => imp.specifier === moduleName && imp.imports.includes("{"));

        // Validate that `identifierReplacements` is not outdated if there's no match
        if (!imp) {
            this.warn(`${chunk.fileName} does not import "${moduleName}" for replacement`);

            process.exitCode = 1;

            continue;
        }

        const replacements = identifierReplacements[moduleName];

        // eslint-disable-next-line guard-for-in
        for (const id in replacements) {
            // Validate that `identifierReplacements` is not outdated if there's no match
            if (!imp.imports.includes(id)) {
                throw new Error(`${chunk.fileName} does not import "${id}" from "${moduleName}" for replacement`);
            }

            const betterId = replacements[id] as string;
            const regexEscapedId = escapeRegex(id);

            // If the better id accesses a namespace, the existing `Foo as Foo$1`
            // named import cannot be replaced with `Foo as Namespace.Foo`, so we
            // pre-emptively remove the whole named import
            if (betterId.includes(".")) {
                // eslint-disable-next-line no-param-reassign
                code = code.replace(new RegExp(`\\b\\w+\\b as ${regexEscapedId},?\\s?`), "");
            }

            // eslint-disable-next-line no-param-reassign
            code = code.replaceAll(new RegExp(`\\b${regexEscapedId}\\b`, "g"), betterId);
        }
    }

    const unreplacedIds = unique(Array.from(code.matchAll(identifierWithTrailingDollarRE), (m) => m[0]));

    if (unreplacedIds.length > 0) {
        const unreplacedString = unreplacedIds.map((id) => `\n- ${id}`).join("");

        const fileWithoutExtension = chunk.fileName.replace(/\.[^/.]+$/, "");

        // Display the warning only once per file
        if (!calledDtsFiles.has(fileWithoutExtension)) {
            logger.warn({
                message: `${chunk.fileName} contains confusing identifier names${unreplacedString}\n\nTo replace these, add them to the "rollup -> patchTypes -> identifierReplacements" option in your packem config.`,
                prefix: "plugin:patch-types",
            });
        }

        calledDtsFiles.set(fileWithoutExtension, true);
    }

    return code;
}

/**
 * Remove `@internal` comments not handled by `compilerOptions.stripInternal`
 * Reference: https://github.com/vuejs/core/blob/main/rollup.dts.config.js
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const removeInternal = (s: MagicString, node: any): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (node.leadingComments?.some((c: any) => c.type === "CommentBlock" && c.value.includes("@internal"))) {
        // Examples:
        // function a(foo: string, /* @internal */ bar: number)
        //                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^
        // strip trailing comma
        const end = s.original[node.end] === "," ? (node.end as number) + 1 : node.end;

        s.remove(node.leadingComments[0].start, end);

        return true;
    }

    return false;
};

/**
 * While we already enable `compilerOptions.stripInternal`, some internal comments
 * like internal parameters are still not stripped by TypeScript, so we run another
 * pass here.
 */
// eslint-disable-next-line func-style
function stripInternalTypes(this: PluginContext, code: string, chunk: RenderedChunk) {
    if (code.includes("@internal")) {
        const s = new MagicString(code);
        const ast = parse(code, {
            plugins: ["typescript"],
            sourceType: "module",
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        walk(ast as any, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            enter(node: any) {
                if (removeInternal(s, node)) {
                    this.skip();
                }
            },
        });

        // eslint-disable-next-line no-param-reassign
        code = s.toString();

        if (code.includes("@internal")) {
            throw new Error(`${chunk.fileName} has unhandled @internal declarations`);
        }
    }

    return code;
}

export type PatchTypesOptions = {
    identifierReplacements?: Record<string, Record<string, string>>;
};

/**
 * Patch the types files before passing to dts plugin
 *
 * 1. Validate unallowed dependency imports
 * 2. Replace confusing type names
 * 3. Strip leftover internal types
 * 4. Clean unnecessary comments
 */
export const patchTypescriptTypes = (options: PatchTypesOptions, logger: Console): Plugin => {
    return {
        name: "packem:patch-types",
        renderChunk(code, chunk) {
            // eslint-disable-next-line no-param-reassign
            code = replaceConfusingTypeNames.call(this, code, chunk, options, logger);
            // eslint-disable-next-line no-param-reassign
            code = stripInternalTypes.call(this, code, chunk);
            // eslint-disable-next-line no-param-reassign
            code = cleanUnnecessaryComments(code);

            return code;
        },
    };
};
