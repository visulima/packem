import fs from "node:fs/promises";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import MagicString from "magic-string";
import type { Plugin, PluginContext, TransformResult } from "rollup";
import type { ExportSpecifier, ImportSpecifier } from "rs-module-lexer";
// eslint-disable-next-line import/no-namespace
import * as rsModuleLexer from "rs-module-lexer";

type Modifications = [start: number, end: number, replace: string][];

interface SimpleParseResult {
    exports: ExportSpecifier[];
    facade: boolean;
    imports: ImportSpecifier[];
}

interface ImportName {
    imported: string;
    local?: string;
}

interface ResolvedSource {
    aliasedImportName?: string;
    exportName?: string;
    id: string;
    resolved?: boolean;
}
interface DebarrelContext {
    /** Temporarily stores file contents to reduce/dedupe readFile calls */
    fileCache: Map<string, Promise<string>>;

    /**
     * Cached parse results for raw file contents keyed by id/filename.
     * IMPORTANT: Do not cache results for code passed to transform(), only for on-disk sources.
     */
    parseCache: Map<string, SimpleParseResult>;

    resolve: PluginContext["resolve"];
}

const IS_SOURCE_EXT = /\.[mc]?tsx?(?:\?.*)?$/;

// Consider TS/JS and their JSX variants, plus common index.* barrels
const POSSIBLE_BARREL_SPECIFIER = /(?:\.[tj]sx?|\/index\.[tj]sx?)(?:\?.*)?$/;

const IS_EXPORT_PREFIXED = /^\s*export/;

const DEFAULT_IMPORT_RE = /^(?:import|export)\s+([\w$]+)/;
// eslint-disable-next-line sonarjs/super-linear-regex -- pattern is bounded by `{` or `,` separators in import specifier lists; inputs are short.
const LEADING_TRAILING_DEFAULT_RE = /([\w$]+)\s*,\s*\{|\}\s*,\s*([\w$]+)/;
const IMPORT_NAMES_TOKENIZER_RE = /[{,]\s*(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?/gi;
const DEFAULT_RE_EXPORT_NAME_RE = /default\s+([a-zA-Z_$][\w$]*)(?:[;\n]|$)/;
// eslint-disable-next-line sonarjs/super-linear-regex -- pattern is anchored at end of string and inputs are short import-clause slices.
const TRAILING_AS_ALIAS_RE = /([\w$]+)\s*as\s*$/;
const WILDCARD_EXPORT_RE = /^export\s+\*(?!\s+as)/;
const AS_KEYWORD_RE = /\bas\b/;

const EMPTY_PARSE_RESULT: SimpleParseResult = { exports: [], facade: false, imports: [] };

const isSourceFile = (id: string) => IS_SOURCE_EXT.test(id);

const isIgnoredModule = (id: string) => id.includes("/build/cache/vite/") || id.includes("/node_modules/");

const isPossibleBarrelSpecifier = (id: string, options: DebarrelPluginOptions) => {
    if (isIgnoredModule(id)) {
        return false;
    }

    if (POSSIBLE_BARREL_SPECIFIER.test(id)) {
        return true;
    }

    if (options.possibleBarrelFiles) {
        return options.possibleBarrelFiles.some((pattern) => {
            if (typeof pattern === "string") {
                return id.includes(pattern);
            }

            return pattern.test(id);
        });
    }

    return false;
};

const getDeclarationKind = (specifiers: string): "export" | "import" => {
    if (IS_EXPORT_PREFIXED.test(specifiers)) {
        return "export";
    }

    return "import";
};

const { parseAsync } = rsModuleLexer;

const safeParse = async (id: string, code: string, logger: Console): Promise<SimpleParseResult> => {
    try {
        const { output } = await parseAsync({
            input: [
                {
                    code,
                    filename: id,
                },
            ],
        });

        return output[0] as SimpleParseResult;
    } catch (error: unknown) {
        logger.debug({
            message: `Failed to parse ${id}:\n  ${error instanceof Error ? error.message : String(error)}`,
            prefix: "plugin:debarrel",
        });

        return EMPTY_PARSE_RESULT;
    }
};

const parsePotentialBarrelFile = async (context: DebarrelContext, id: string, code: string, logger: Console): Promise<SimpleParseResult> => {
    const cached = context.parseCache.get(id);

    if (cached !== undefined) {
        return cached;
    }

    const parsed = await safeParse(id, code, logger);

    context.parseCache.set(id, parsed);

    return parsed;
};

const readFileCached = (context: DebarrelContext, id: string) => {
    const cached = context.fileCache.get(id);

    if (cached !== undefined) {
        return cached;
    }

    const promise = fs.readFile(id, "utf8");

    context.fileCache.set(id, promise);

    return promise;
};

const getImportNames = (specifiers: string): ImportName[] => {
    IMPORT_NAMES_TOKENIZER_RE.lastIndex = 0;

    const names: ImportName[] = [];

    if (specifiers.includes("*")) {
        return names;
    }

    if (!specifiers.includes("{")) {
        const defaultMatch = DEFAULT_IMPORT_RE.exec(specifiers);

        if (defaultMatch) {
            names.push({ imported: "default", local: defaultMatch[1] });
        }

        return names;
    }

    const defaultMatch = LEADING_TRAILING_DEFAULT_RE.exec(specifiers);

    if (defaultMatch) {
        names.push({ imported: "default", local: defaultMatch[1] ?? defaultMatch[2] });
    }

    let token: RegExpExecArray | null = IMPORT_NAMES_TOKENIZER_RE.exec(specifiers);

    while (token !== null) {
        if (!token[1] && token[2]) {
            names.push({ imported: token[2], local: token[3] });
        }

        token = IMPORT_NAMES_TOKENIZER_RE.exec(specifiers);
    }

    return names;
};

const findMatchingImport = (exp: ExportSpecifier, imports: ImportSpecifier[], code: string): { imp: ImportSpecifier | undefined; localExportName?: string } => {
    let localExportName = exp.ln;

    let imp = imports.find((index: ImportSpecifier) => index.ss < exp.s && index.se > exp.e && index.d === -1);

    if (!imp?.n) {
        const ln = localExportName ?? DEFAULT_RE_EXPORT_NAME_RE.exec(code.slice(exp.s))?.[1];

        if (ln) {
            imp = imports.find((index: ImportSpecifier) => {
                const names = getImportNames(code.slice(index.ss, index.s));
                const spec = names.find((n) => n.local === ln);

                if (spec) {
                    localExportName = spec.imported;
                }

                return spec;
            });
        }
    }

    if (imp && !localExportName) {
        const slice = code.slice(imp.ss, exp.s);

        if (!slice.includes("*")) {
            const ln = TRAILING_AS_ALIAS_RE.exec(slice)?.[1];

            if (ln) {
                localExportName = ln;
            }
        }
    }

    return { imp, localExportName };
};

// exportNames are JS identifiers, so the compiled `… as <name>` matcher is stable —
// cache it per exportName to avoid recompiling the RegExp on every barrel resolution.
const aliasedImportRegexCache = new Map<string, RegExp>();

const findAliasedImportName = (specifiers: string, exportName: string): string | undefined => {
    if (getDeclarationKind(specifiers) !== "import" || !AS_KEYWORD_RE.test(specifiers)) {
        return undefined;
    }

    // Ensure we only match full identifier aliases, not prefixes
    let regex = aliasedImportRegexCache.get(exportName);

    if (!regex) {
        regex = new RegExp(String.raw`(\w+)\s+as\s+${exportName}(?!\w)`);
        aliasedImportRegexCache.set(exportName, regex);
    }

    return regex.exec(specifiers)?.[0];
};

// Forward declaration to support mutual recursion between helpers and `resolveThroughBarrel`.
let resolveThroughBarrel: (
    context: DebarrelContext,
    id: string,
    exportName: string,
    options: DebarrelPluginOptions,
    logger: Console,
) => Promise<ResolvedSource>;

const resolveExportThroughBarrel = async (
    context: DebarrelContext,
    id: string,
    code: string,
    exp: ExportSpecifier,
    imports: ImportSpecifier[],
    exportName: string,
    options: DebarrelPluginOptions,
    logger: Console,
): Promise<ResolvedSource> => {
    const { resolve } = context;
    const matchingImport = findMatchingImport(exp, imports, code);
    const { imp, localExportName } = matchingImport;

    if (!imp?.n) {
        return { exportName, id, resolved: true };
    }

    if (imp.d > -1) {
        return { exportName, id, resolved: true };
    }

    const specifiers = code.slice(imp.ss, exp.s);
    const aliasedImportName = findAliasedImportName(specifiers, exportName);
    const resolved = await resolve(imp.n, id);
    const resolvedId = resolved?.id;

    if (!resolvedId) {
        return {
            aliasedImportName,
            exportName: localExportName,
            id,
            resolved: false,
        };
    }

    if (isPossibleBarrelSpecifier(resolvedId, options)) {
        return resolveThroughBarrel(context, resolvedId, localExportName ?? exp.n, options, logger);
    }

    return {
        aliasedImportName,
        exportName: localExportName ?? exportName,
        id: resolvedId,
        resolved: false,
    };
};

const resolveWildcardReExports = async (
    context: DebarrelContext,
    id: string,
    code: string,
    imports: ImportSpecifier[],
    exportName: string,
    options: DebarrelPluginOptions,
    logger: Console,
): Promise<ResolvedSource | undefined> => {
    const wildcards = imports.filter((index) => WILDCARD_EXPORT_RE.test(code.slice(index.ss, index.s)));

    if (wildcards.length === 1) {
        const first = wildcards[0];
        const name = first?.n;
        const resolveResult = name ? await context.resolve(name, id) : undefined;
        const resolveId = resolveResult?.id;

        if (!resolveId) {
            return undefined;
        }

        const inner = await resolveThroughBarrel(context, resolveId, exportName, options, logger);

        if (inner.resolved) {
            return inner;
        }
    } else if (wildcards.length > 1) {
        const returnValue = await Promise.all(
            wildcards.map(async (wc) => {
                const moduleName = wc.n;

                if (!moduleName) {
                    return undefined;
                }

                const resolveResult = await context.resolve(moduleName, id);
                const resolveId = resolveResult?.id;

                if (!resolveId) {
                    return undefined;
                }

                return resolveThroughBarrel(context, resolveId, exportName, options, logger);
            }),
        );

        const selected = returnValue.find((wc) => wc?.resolved);

        if (selected) {
            return selected;
        }
    }

    return undefined;
};

resolveThroughBarrel = async (
    context: DebarrelContext,
    id: string,
    exportName: string,
    options: DebarrelPluginOptions,
    logger: Console,
): Promise<ResolvedSource> => {
    const code = await readFileCached(context, id);
    const { exports, imports } = await parsePotentialBarrelFile(context, id, code, logger);

    // Walk all explicit export specifiers
    for (const exp of exports) {
        if (exp.n !== exportName) {
            continue;
        }

        // eslint-disable-next-line no-await-in-loop -- sequential per-export resolution is required because we return on the first match.
        return await resolveExportThroughBarrel(context, id, code, exp, imports, exportName, options, logger);
    }

    // Attempt to resolve via wildcard re-exports
    const wildcardResult = await resolveWildcardReExports(context, id, code, imports, exportName, options, logger);

    if (wildcardResult) {
        return wildcardResult;
    }

    return { exportName, id, resolved: false };
};

const getDeclarationClause = (resolvedSource: ResolvedSource, importName: ImportName, declarationKind: "import" | "export"): string => {
    const { aliasedImportName, exportName } = resolvedSource;
    const local = importName.local ?? importName.imported;

    if (aliasedImportName) {
        return `{${aliasedImportName}}`;
    }

    if (exportName === "default" && declarationKind !== "export") {
        return local;
    }

    const effectiveExport = exportName ?? local;
    const isLocallyAliased = effectiveExport !== local;

    return `{${isLocallyAliased ? `${effectiveExport} as ${local}` : effectiveExport}}`;
};

const getDebarrelModifications = async (context: DebarrelContext, id: string, _code: string, options: DebarrelPluginOptions, logger: Console) => {
    const modifications: Modifications = [];
    // Parse the original file content instead of transformed code
    // rs-module-lexer is designed to parse source files (TS/JSX), not transformed code
    // Most transformations preserve import statements, so positions should still work
    const originalCode = await readFileCached(context, id);
    const { imports } = await safeParse(id, originalCode, logger);

    await Promise.all(
        imports.map(async (imp) => {
            if (!imp.n || imp.d !== -1) {
                return;
            }

            // Extract specifiers from original code (positions are relative to original file)
            const specifiers = originalCode.slice(imp.ss, imp.s);
            const importNames = getImportNames(specifiers);

            if (importNames.length === 0) {
                return;
            }

            const resolved = await context.resolve(imp.n, id);
            const resolvedId = resolved?.id;

            if (!resolvedId) {
                return;
            }

            if (!isSourceFile(resolvedId)) {
                return;
            }

            if (isIgnoredModule(resolvedId)) {
                return;
            }

            const declarationKind = getDeclarationKind(specifiers);

            try {
                const replacements = await Promise.all(
                    importNames.map(async (importName) => {
                        const debarrelled = await resolveThroughBarrel(context, resolvedId, importName.imported, options, logger);
                        const clause = getDeclarationClause(debarrelled, importName, declarationKind);
                        const moduleSpecifier = JSON.stringify(debarrelled.id);

                        return `${declarationKind} ${clause} from ${moduleSpecifier}`;
                    }),
                );

                // Apply modifications using positions from original file
                // Most transformations preserve import statements, so positions should match
                modifications.push([imp.ss, imp.se, replacements.join(";")]);
            } catch (error) {
                logger.warn({
                    context: {
                        error,
                    },
                    message: String(error),
                    prefix: "plugin:debarrel",
                });
            }
        }),
    );

    return modifications;
};

const applyModifications = (id: string, code: string, modifications: Modifications, sourceMap: boolean): TransformResult | undefined => {
    if (modifications.length === 0) {
        return undefined;
    }

    const out = new MagicString(code, { filename: id });

    for (const [start, end, replace] of modifications) {
        out.update(start, end, replace);
    }

    return {
        code: out.toString(),
        map: sourceMap ? out.generateMap({ file: id }) : undefined,
    };
};

export interface DebarrelPluginOptions {
    include?: FilterPattern;
    possibleBarrelFiles?: (RegExp | string)[];
}

export const debarrelPlugin = (options: DebarrelPluginOptions, logger: Console): Plugin => {
    const fileCache: DebarrelContext["fileCache"] = new Map();
    const parseCache: DebarrelContext["parseCache"] = new Map();

    const purgeCaches = () => {
        fileCache.clear();
        parseCache.clear();
    };

    // Allow user to scope by include patterns if needed
    const includeFilter: ((id: string) => boolean) | undefined = options.include ? createFilter(options.include, []) : undefined;

    let isSourceMap = true;

    return {
        buildEnd: purgeCaches,
        buildStart: purgeCaches,

        async load(id) {
            const cached = fileCache.get(id);

            if (cached) {
                return await cached;
            }

            return undefined;
        },

        name: "packem:debarrel",

        // align sourcemap behavior with Rollup options
        options(inputOptions) {
            const { output } = inputOptions as { output?: { sourcemap?: boolean }[] | { sourcemap?: boolean } };
            let sm: boolean | undefined;

            if (Array.isArray(output)) {
                sm = output[0]?.sourcemap;
            } else if (output) {
                sm = output.sourcemap;
            }

            if (sm === false) {
                isSourceMap = false;
            }

            return undefined;
        },

        async transform(code, id) {
            // Skip virtual modules and query-suffixed ids (e.g. Vue/Svelte SFC
            // sub-modules like `App.vue?vue&type=script&lang.ts`, commonjs proxies).
            // These are not on-disk barrel files, yet their id can end in a source
            // extension; getDebarrelModifications reads the source by id from disk,
            // so passing a virtual id through would throw ENOENT.
            if (id.includes("\0") || id.includes("?")) {
                return undefined;
            }

            if (!isSourceFile(id)) {
                return undefined;
            }

            if (includeFilter && !includeFilter(id)) {
                return undefined;
            }

            const context: DebarrelContext = {
                fileCache,
                parseCache,
                resolve: this.resolve.bind(this),
            };

            const modifications = await getDebarrelModifications(context, id, code, options, logger);

            return applyModifications(id, code, modifications, isSourceMap);
        },

        watchChange(id) {
            fileCache.delete(id);
            parseCache.delete(id);
        },
    };
};
