/**
 * Modified copy of https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-bundler/src/postcss-import/lib/parse-styles.ts
 *
 * MIT No Attribution (MIT-0)
 * Copyright © CSSTools Contributors
 */
import { dirname, normalize } from "@visulima/path";
import type { AtRule, Document, Postcss, Result, Root } from "postcss";

import type { Condition, ImportOptions, ImportStatement, State, Statement, Stylesheet } from "../types";
import { isValidDataURL } from "../utils/data-url";
import formatImportPrelude from "../utils/format-import-prelude";
import processContent from "../utils/process-content";
import { isImportStatement } from "../utils/statement";
import parseStylesheet from "./parse-stylesheet";

// eslint-disable-next-line security/detect-unsafe-regex
const PROTOCOL_REGEX = /^(?:[a-z]+:)?\/\//i;

const isProcessableURL = (uri: string): boolean => {
    // skip protocol base uri (protocol://url) or protocol-relative
    if (PROTOCOL_REGEX.test(uri)) {
        return false;
    }

    // check for fragment or query
    try {
        // needs a base to parse properly
        const url = new URL(uri, "https://example.com");

        if (url.search) {
            return false;
        }
    } catch {
        // Ignore
    }

    return true;
};

const loadImportContent = async (
    result: Result,
    stmt: ImportStatement,
    filename: string,
    options: { root: string } & ImportOptions,
    state: State,
    postcss: Postcss,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<Stylesheet> => {
    const { conditions, from, node } = stmt;

    const stmtDuplicateCheckKey = conditions
        .map((condition) => formatImportPrelude(condition.layer, condition.media, condition.supports, condition.scope))
        .join(":");

    if (options.skipDuplicates) {
        // skip files already imported at the same scope
        // eslint-disable-next-line security/detect-object-injection
        if (state.importedFiles[filename]?.[stmtDuplicateCheckKey]) {
            return { statements: [] };
        }

        // save imported files to skip them next time
        // eslint-disable-next-line security/detect-object-injection
        if (!state.importedFiles[filename]) {
            // eslint-disable-next-line no-param-reassign,security/detect-object-injection
            state.importedFiles[filename] = {};
        }

        // eslint-disable-next-line no-param-reassign,security/detect-object-injection
        state.importedFiles[filename][stmtDuplicateCheckKey] = true;
    }

    if (from.includes(filename)) {
        return { statements: [] };
    }

    const content = await options.load(filename, options);

    if (content.trim() === "" && options.warnOnEmpty) {
        result.warn(`${filename} is empty`, { node });

        return { statements: [] };
    }

    // skip previous imported files not containing @import rules
    // eslint-disable-next-line security/detect-object-injection
    if (options.skipDuplicates && state.hashFiles[content]?.[stmtDuplicateCheckKey]) {
        return { statements: [] };
    }

    const importedResult = await processContent(result, content, filename, options, postcss);
    const styles = importedResult.root;

    if (options.debug) {
        styles.append({ text: filename });
    }

    // eslint-disable-next-line no-param-reassign
    result.messages = [...result.messages, ...importedResult.messages];

    if (options.skipDuplicates) {
        const hasImport = styles.some((child) => child.type === "atrule" && child.name === "import");

        if (!hasImport) {
            // save hash files to skip them next time
            // eslint-disable-next-line security/detect-object-injection
            if (!state.hashFiles[content]) {
                // eslint-disable-next-line no-param-reassign,security/detect-object-injection
                state.hashFiles[content] = {};
            }

            // eslint-disable-next-line no-param-reassign,security/detect-object-injection
            state.hashFiles[content][stmtDuplicateCheckKey] = true;
        }
    }

    // recursion: import @import from imported file
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return await parseStyles(options, result, styles, state, node, conditions, [...from, filename], postcss);
};

const resolveImportId = async (options: { root: string } & ImportOptions, result: Result, stmt: ImportStatement, state: State, postcss: Postcss) => {
    if (isValidDataURL(stmt.uri)) {
        // eslint-disable-next-line no-param-reassign
        stmt.stylesheet = await loadImportContent(result, stmt, stmt.uri, options, state, postcss);

        return;
    }

    if (isValidDataURL(stmt.from.at(-1))) {
        // Data urls can't be used as a base url to resolve imports.
        // Skip inlining and warn.
        // eslint-disable-next-line no-param-reassign
        stmt.stylesheet = { statements: [] };

        result.warn(`Unable to import '${stmt.uri}' from a stylesheet that is embedded in a data url`, {
            node: stmt.node,
        });

        return;
    }

    const atRule = stmt.node;

    let sourceFile: string | undefined;

    if (atRule.source?.input.file) {
        sourceFile = atRule.source.input.file;
    }

    const base = sourceFile ? dirname(sourceFile) : options.root;

    // Resolve aliases
    for (const [from, to] of Object.entries(options.alias)) {
        if (stmt.uri !== from && !stmt.uri.startsWith(`${from}/`)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        // eslint-disable-next-line no-param-reassign
        stmt.uri = normalize(to) + stmt.uri.slice(from.length);
    }

    let resolved;

    try {
        resolved = await options.resolve(stmt.uri, base, options.extensions, atRule);
    } catch {
        stmt.node.warn(result, `Unable to resolve "${stmt.uri}" from "${base}"`);

        return;
    }

    // Add dependency messages:
    result.messages.push({
        file: resolved,
        parent: sourceFile,
        plugin: "packem-postcss-import",
        type: "dependency",
    });

    // eslint-disable-next-line no-param-reassign
    stmt.stylesheet = await loadImportContent(result, stmt, resolved, options, state, postcss);
};

const parseStyles = async (
    options: { root: string } & ImportOptions,
    result: Result,
    styles: Root | Document,
    state: State,
    importingNode: AtRule | null,
    conditions: Condition[],
    from: string[],
    postcss: Postcss,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<Stylesheet> => {
    // eslint-disable-next-line prefer-const
    let { charset, statements } = parseStylesheet(result, styles, importingNode, conditions, from);

    {
        // Lazy because the current stylesheet might not contain any further @import statements
        const jobs: Promise<void>[] = [];

        for await (const stmt of statements) {
            if (!isImportStatement(stmt) || !isProcessableURL(stmt.uri)) {
                // eslint-disable-next-line no-continue
                continue;
            }

            // eslint-disable-next-line unicorn/no-array-callback-reference
            if (options.filter && !options.filter((stmt as ImportStatement).uri)) {
                // rejected by filter
                // eslint-disable-next-line no-continue
                continue;
            }

            jobs.push(resolveImportId(options, result, stmt as ImportStatement, state, postcss));
        }

        if (jobs.length > 0) {
            await Promise.all(jobs);
        }
    }

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < statements.length; index++) {
        // eslint-disable-next-line security/detect-object-injection
        const stmt = statements[index] as Statement;

        if (isImportStatement(stmt) && stmt.stylesheet) {
            if (charset && stmt.stylesheet.charset && charset.params.toLowerCase() !== stmt.stylesheet.charset.params.toLowerCase()) {
                throw stmt.stylesheet.charset.error(
                    "Incompatible @charset statements:\n" +
                         
                        `  ${stmt.stylesheet.charset.params} specified in ${stmt.stylesheet.charset.source?.input.file}\n` +
                         
                        `  ${charset.params} specified in ${charset.source?.input.file}`,
                );
            } else if (!charset && !!stmt.stylesheet.charset) {
                charset = stmt.stylesheet.charset;
            }

            statements.splice(index, 1, ...stmt.stylesheet.statements);
            // eslint-disable-next-line no-plusplus
            index--;
        }
    }

    return { charset, statements };
};

export default parseStyles;
