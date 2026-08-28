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
    statement: ImportStatement,
    filename: string,
    options: ImportOptions & { root: string },
    state: State,
    postcss: Postcss,
): Promise<Stylesheet> => {
    const { conditions, from, node } = statement;

    const statementDuplicateCheckKey = conditions
        .map((condition) => formatImportPrelude(condition.layer, condition.media, condition.supports, condition.scope))
        .join(":");

    if (options.skipDuplicates) {
        // skip files already imported at the same scope

        if (state.importedFiles[filename]?.[statementDuplicateCheckKey]) {
            return { statements: [] };
        }

        // save imported files to skip them next time

        // eslint-disable-next-line no-param-reassign
        state.importedFiles[filename] ??= {};

        // eslint-disable-next-line no-param-reassign
        state.importedFiles[filename][statementDuplicateCheckKey] = true;
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

    if (options.skipDuplicates && state.hashFiles[content]?.[statementDuplicateCheckKey]) {
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

            // eslint-disable-next-line no-param-reassign
            state.hashFiles[content] ??= {};

            // eslint-disable-next-line no-param-reassign
            state.hashFiles[content][statementDuplicateCheckKey] = true;
        }
    }

    // recursion: import @import from imported file
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return await parseStyles(options, result, styles, state, node, conditions, [...from, filename], postcss);
};

const resolveImportId = async (options: ImportOptions & { root: string }, result: Result, statement: ImportStatement, state: State, postcss: Postcss) => {
    if (isValidDataURL(statement.uri)) {
        // eslint-disable-next-line no-param-reassign
        statement.stylesheet = await loadImportContent(result, statement, statement.uri, options, state, postcss);

        return;
    }

    if (isValidDataURL(statement.from.at(-1))) {
        // Data urls can't be used as a base url to resolve imports.
        // Skip inlining and warn.
        // eslint-disable-next-line no-param-reassign
        statement.stylesheet = { statements: [] };

        result.warn(`Unable to import '${statement.uri}' from a stylesheet that is embedded in a data url`, {
            node: statement.node,
        });

        return;
    }

    const atRule = statement.node;

    let sourceFile: string | undefined;

    if (atRule.source?.input.file) {
        sourceFile = atRule.source.input.file;
    }

    const base = sourceFile ? dirname(sourceFile) : options.root;

    // Resolve aliases
    for (const [from, to] of Object.entries(options.alias)) {
        if (statement.uri !== from && !statement.uri.startsWith(`${from}/`)) {
            continue;
        }

        // eslint-disable-next-line no-param-reassign
        statement.uri = normalize(to) + statement.uri.slice(from.length);
    }

    let resolved;

    try {
        resolved = await options.resolve(statement.uri, base, options.extensions, atRule);
    } catch (error: unknown) {
        const reason = error instanceof Error ? `: ${error.message}` : "";

        statement.node.warn(result, `Unable to resolve "${statement.uri}" from "${base}"${reason}`);

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
    statement.stylesheet = await loadImportContent(result, statement, resolved, options, state, postcss);
};

const parseStyles = async (
    options: ImportOptions & { root: string },
    result: Result,
    styles: Document | Root,
    state: State,
    importingNode: AtRule | undefined,
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

        for (const statement of statements) {
            if (!isImportStatement(statement) || !isProcessableURL(statement.uri)) {
                continue;
            }

            if (options.filter && !options.filter(statement.uri)) {
                // rejected by filter

                continue;
            }

            jobs.push(resolveImportId(options, result, statement, state, postcss));
        }

        if (jobs.length > 0) {
            await Promise.all(jobs);
        }
    }

    // eslint-disable-next-line no-plusplus
    for (let index = 0; index < statements.length; index++) {
        const statement = statements[index] as Statement;

        if (isImportStatement(statement) && statement.stylesheet) {
            if (charset && statement.stylesheet.charset && charset.params.toLowerCase() !== statement.stylesheet.charset.params.toLowerCase()) {
                throw statement.stylesheet.charset.error(
                    "Incompatible @charset statements:\n"
                        + `  ${statement.stylesheet.charset.params} specified in ${statement.stylesheet.charset.source?.input.file ?? "<unknown>"}\n`
                        + `  ${charset.params} specified in ${charset.source?.input.file ?? "<unknown>"}`,
                );
            }

            if (!charset && statement.stylesheet.charset) {
                charset = statement.stylesheet.charset;
            }

            statements.splice(index, 1, ...statement.stylesheet.statements);

            index -= 1;
        }
    }

    return { charset, statements };
};

export default parseStyles;
