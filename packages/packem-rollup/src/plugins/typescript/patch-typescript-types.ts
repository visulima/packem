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

const FILE_EXTENSION_RE = /\.[^/.]+$/;

// eslint-disable-next-line func-style
function stripLicenseComment(comment: string): string {
    return licenseCommentsRE.test(comment) ? "" : comment;
}

const cleanUnnecessaryComments = (code: string): string =>
    code.replaceAll(multilineCommentsRE, stripLicenseComment).replaceAll(consecutiveNewlinesRE, "\n\n");

const calledDtsFiles = new Map<string, boolean>();

/**
 * Replaces deduplicated type names that rollup gives a trailing `$1`/`$2` suffix
 * back to nicer identifiers via the `identifierReplacements` map, so they read
 * sensibly in IDE autocompletions.
 */
// eslint-disable-next-line func-style
function replaceConfusingTypeNames(this: PluginContext, code: string, chunk: RenderedChunk, { identifierReplacements }: PatchTypesOptions, logger: Console): string {
    const imports = findStaticImports(code);
    let nextCode = code;

    for (const moduleName of Object.keys(identifierReplacements ?? {})) {
        const matchingImport = imports.find((importDeclaration) => importDeclaration.specifier === moduleName && importDeclaration.imports.includes("{"));

        // Validate that `identifierReplacements` is not outdated if there's no match
        if (!matchingImport) {
            this.warn(`${chunk.fileName} does not import "${moduleName}" for replacement`);

            process.exitCode = 1;

            continue;
        }

        const replacements = identifierReplacements?.[moduleName] ?? {};

        for (const id of Object.keys(replacements)) {
            // Validate that `identifierReplacements` is not outdated if there's no match
            if (!matchingImport.imports.includes(id)) {
                throw new Error(`${chunk.fileName} does not import "${id}" from "${moduleName}" for replacement`);
            }

            const betterId = replacements[id] as string;
            const regexEscapedId = escapeRegex(id);

            // If the better id accesses a namespace, the existing `Foo as Foo$1`
            // named import cannot be replaced with `Foo as Namespace.Foo`, so we
            // pre-emptively remove the whole named import
            if (betterId.includes(".")) {
                nextCode = nextCode.replace(new RegExp(String.raw`\b\w+\b as ${regexEscapedId},?\s?`), "");
            }

            nextCode = nextCode.replaceAll(new RegExp(String.raw`\b${regexEscapedId}\b`, "g"), betterId);
        }
    }

    const unreplacedIds = unique(Array.from(nextCode.matchAll(identifierWithTrailingDollarRE), (m) => m[0]));

    if (unreplacedIds.length > 0) {
        const unreplacedString = unreplacedIds.map((id) => `\n- ${id}`).join("");

        const fileWithoutExtension = chunk.fileName.replace(FILE_EXTENSION_RE, "");

        // Display the warning only once per file
        if (!calledDtsFiles.has(fileWithoutExtension)) {
            logger.warn({
                message: `${chunk.fileName} contains confusing identifier names${unreplacedString}\n\nTo replace these, add them to the "rollup -> patchTypes -> identifierReplacements" option in your packem config.`,
                prefix: "plugin:patch-types",
            });
        }

        calledDtsFiles.set(fileWithoutExtension, true);
    }

    return nextCode;
}

interface NodeWithComments {
    end: number;
    leadingComments?: { start: number; type?: string; value?: string }[];
    start: number;
}

/**
 * Removes `@internal` comments and the parameters/declarations they annotate
 * that `compilerOptions.stripInternal` leaves behind. See vuejs/core's rollup.dts.config.js for prior art.
 */
const removeInternal = (s: MagicString, node: NodeWithComments): boolean => {
    if (node.leadingComments?.some((comment) => comment.type === "CommentBlock" && comment.value?.includes("@internal"))) {
        // Examples:
        // function a(foo: string, /* @internal */ bar: number)
        //                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^
        // strip trailing comma
        const end = s.original[node.end] === "," ? node.end + 1 : node.end;
        const firstLeadingComment = node.leadingComments[0];

        if (firstLeadingComment) {
            s.remove(firstLeadingComment.start, end);
        }

        return true;
    }

    return false;
};

/**
 * Runs a second pass after TypeScript's `compilerOptions.stripInternal` to
 * scrub leftover `@internal` markers (e.g. on parameters) that TypeScript leaves intact.
 */
// eslint-disable-next-line func-style
function stripInternalTypes(this: PluginContext, code: string, chunk: RenderedChunk): string {
    if (!code.includes("@internal")) {
        return code;
    }

    const s = new MagicString(code);
    const ast = parse(code, {
        plugins: ["typescript"],
        sourceType: "module",
    });

    walk(ast as unknown as import("estree").Node, {
        enter(node: import("estree").Node) {
            if (removeInternal(s, node as unknown as NodeWithComments)) {
                this.skip();
            }
        },
    });

    const nextCode = s.toString();

    if (nextCode.includes("@internal")) {
        throw new Error(`${chunk.fileName} has unhandled @internal declarations`);
    }

    return nextCode;
}

export type PatchTypesOptions = {
    identifierReplacements?: Record<string, Record<string, string>>;
};

/**
 * Patches the bundled types output before passing to the dts plugin.
 *
 * 1. Validate unallowed dependency imports.
 * 2. Replace confusing type names.
 * 3. Strip leftover internal types.
 * 4. Clean unnecessary comments.
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
