import { dirname, normalize } from "@visulima/path";
import type { AtRule, Document, Helpers, Node, Postcss, Root, Source } from "postcss";

import type { ImportOptions, ImportStatement, State, Statement } from "../types";
import { isValid } from "../utils/data-url";
import formatImportPrelude from "../utils/format-import-prelude";
import processContent from "../utils/process-content";
import parseStatements from "./parse-statements";

const isProcessableURL = (uri: string): boolean => {
    // skip protocol base uri (protocol://url) or protocol-relative
    if (/^(?:[a-z]+:)?\/\//i.test(uri)) {
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
    result: Helpers["result"],
    stmt: Statement | ImportStatement,
    filename: string,
    options: ImportOptions,
    state: State,
    postcss: Postcss,
): Promise<undefined | Statement[]> => {
    const atRule = stmt.node;
    const { conditions, from } = stmt;
    const stmtDuplicateCheckKey = conditions.map((condition) => formatImportPrelude(condition.layer, condition.media, condition.supports)).join(":");

    if (options.skipDuplicates) {
        // skip files already imported at the same scope
        // eslint-disable-next-line security/detect-object-injection
        if (state.importedFiles[filename]?.[stmtDuplicateCheckKey]) {
            return undefined;
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

    if (from?.includes(filename)) {
        return undefined;
    }

    const content = await options.load(filename, options);

    if (content.trim() === "" && options.warnOnEmpty) {
        result.warn(`${filename} is empty`, { node: atRule as Node });
        return undefined;
    }

    // skip previous imported files not containing @import rules
    // eslint-disable-next-line security/detect-object-injection
    if (options.skipDuplicates && state.hashFiles[content]?.[stmtDuplicateCheckKey]) {
        return undefined;
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
    return await parseStyles(result, styles, options, state, conditions, filename, postcss);
};

const resolveImportId = async (result: Helpers["result"], stmt: ImportStatement, options: ImportOptions, state: State, postcss: Postcss) => {
    if (isValid(stmt.uri)) {
        // eslint-disable-next-line no-param-reassign
        stmt.children = await loadImportContent(result, stmt, stmt.uri, options, state, postcss);

        return;
    }

    if (stmt.from && isValid(stmt.from)) {
        // Data urls can't be used as a base url to resolve imports.
        throw stmt.node.error(`Unable to import '${stmt.uri as string}' from a stylesheet that is embedded in a data url`);
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

    const resolved = await options.resolve(stmt.uri, base, options.extensions, atRule);

    // Add dependency messages:
    result.messages.push({
        file: resolved,
        parent: sourceFile,
        plugin: "postcss-import",
        type: "dependency",
    });

    const importedContent = await loadImportContent(result, stmt, resolved, options, state, postcss);

    // Merge loaded statements
    if (importedContent) {
        // eslint-disable-next-line no-param-reassign
        stmt.children = importedContent.filter((x) => !!x);
    }
};

const parseStyles = async (
    result: Helpers["result"],
    styles: Root | Document,
    options: ImportOptions,
    state: State,
    conditions,
    from: string | undefined,
    postcss: Postcss,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<Statement[]> => {
    const statements = parseStatements(result, styles, conditions, from);

    for await (const stmt of statements) {
        if (stmt.type !== "import" || (stmt.uri && !isProcessableURL(stmt.uri))) {
            // eslint-disable-next-line no-continue
            continue;
        }

        if (options.filter && !options.filter((stmt as ImportStatement).uri)) {
            // rejected by filter
            // eslint-disable-next-line no-continue
            continue;
        }

        await resolveImportId(result, stmt as ImportStatement, options, state, postcss);
    }

    let charset: Statement | undefined;

    const imports: ImportStatement[] = [];
    const bundle: Statement[] = [];

    const handleCharset = (stmt: Statement) => {
        if (!charset) {
            charset = stmt;
        }

        // charsets aren't case-sensitive, so convert to lower case to compare
        else if (((stmt.node as AtRule).params as string).toLowerCase() !== ((charset.node as AtRule).params as string).toLowerCase()) {
            throw (stmt.node as Node).error(
                "Incompatible @charset statements: " +
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    `${(stmt.node as AtRule).params as string} specified in ${((stmt.node as Node).source as Source).input.file} ${(charset.node as AtRule).params} specified in ${((charset.node as Node).source as Source).input.file}`,
            );
        }
    };

    // squash statements and their children
    statements.forEach((stmt) => {
        switch (stmt.type) {
            case "charset": {
                handleCharset(stmt);
                break;
            }
            case "import": {
                if (stmt.children) {
                    stmt.children.forEach((child, index) => {
                        if (child.type === "import") {
                            imports.push(child);
                        } else if (child.type === "charset") {
                            handleCharset(child);
                        } else {
                            bundle.push(child);
                        }

                        // For better output
                        if (index === 0) {
                            // eslint-disable-next-line no-param-reassign
                            child.parent = stmt;
                        }
                    });
                } else {
                    imports.push(stmt as ImportStatement);
                }

                break;
            }
            case "nodes": {
                bundle.push(stmt);

                break;
            }
            default:
            // No default
        }
    });

    return charset ? [charset, ...imports, ...bundle] : [...imports, ...bundle];
};

export default parseStyles;
