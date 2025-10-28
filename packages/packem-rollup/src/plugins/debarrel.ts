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
const POSSIBLE_BARREL_SPECIFIER = /(?:\.(?:[tj]s|[tj]sx)|\/index\.(?:[tj]s|[tj]sx))(?:\?.*)?$/;

const IS_EXPORT_PREFIXED = /^\s*export/;

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
        return options.possibleBarrelFiles.some((pattern) => id.match(pattern));
    }

    return false;
};

const getDeclarationKind = (specifiers: string) => IS_EXPORT_PREFIXED.test(specifiers) ? "export" : "import";

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
        logger.warn({
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
    const defaultImportRegex = /^(?:import|export)\s+([\w$]+)/;

    const leadingTrailingDefaultRegex = /([\w$]+)\s*,\s*\{|\}\s*,\s*([\w$]+)/;
    const importNamesTokenizer = /[{,]\s*(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?/gi;

    importNamesTokenizer.lastIndex = 0;

    const names: ImportName[] = [];

    if (specifiers.includes("*")) {
        return names;
    }

    if (!specifiers.includes("{")) {
        const defaultMatch = specifiers.match(defaultImportRegex);

        if (defaultMatch) {
            names.push({ imported: "default", local: defaultMatch[1] as string });
        }

        return names;
    }

    const defaultMatch = specifiers.match(leadingTrailingDefaultRegex);

    if (defaultMatch) {
        names.push({ imported: "default", local: (defaultMatch[1] || defaultMatch[2]) as string });
    }

    let token: RegExpExecArray | null;

    // eslint-disable-next-line no-cond-assign
    while (token = importNamesTokenizer.exec(specifiers)) {
        if (token[1]) {
            continue; // types
        }

        if (!token[2]) {
            continue;
        }

        names.push({ imported: token[2] as string, local: token[3] as string | undefined });
    }

    return names;
};

const findMatchingImport = (exp: ExportSpecifier, imports: ImportSpecifier[], code: string) => {
    let localExportName = exp.ln;

    let imp = imports.find((index: ImportSpecifier) => index.ss < exp.s && index.se > exp.e && index.d === -1);

    if (!imp || !imp.n) {
        const ln = localExportName || code.slice(exp.s).match(/default\s+([a-zA-Z_$][\w$]*)(?:;|\n|$)/)?.[1];

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
            const ln = slice.match(/([\w$]+)\s*as\s*$/)?.[1];

            if (ln) {
                localExportName = ln;
            }
        }
    }

    return { imp, localExportName } as { imp: ImportSpecifier | undefined; localExportName?: string };
};

const resolveThroughBarrel = async (
    context: DebarrelContext,
    id: string,
    exportName: string,
    options: DebarrelPluginOptions,
    logger: Console,
): Promise<ResolvedSource> => {
    const { resolve } = context;
    const code = await readFileCached(context, id);
    const { exports, imports } = await parsePotentialBarrelFile(context, id, code, logger);

    // Walk all explicit export specifiers
    for await (const exp of exports) {
        const exported = exp.n;

        if (exported !== exportName) {
            continue;
        }

        const matchingImport = findMatchingImport(exp, imports, code);
        const { imp, localExportName } = matchingImport;

        if (!imp || !imp.n) {
            return { exportName, id, resolved: true };
        }

        if (imp.d > -1) {
            return { exportName, id, resolved: true };
        }

        let aliasedImportName: string | undefined;
        const specifiers = code.slice(imp.ss, exp.s);

        if (getDeclarationKind(specifiers) === "import" && /\bas\b/.test(specifiers)) {
            // Ensure we only match full identifier aliases, not prefixes
            const regex = new RegExp(`(\\w+)\\s+as\\s+${exportName}(?!\\w)`);

            aliasedImportName = specifiers.match(regex)?.[0];
        }

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
            return resolveThroughBarrel(context, resolvedId, localExportName || exported, options, logger);
        }

        return {
            aliasedImportName,
            exportName: localExportName || exportName,
            id: resolvedId,
            resolved: false,
        };
    }

    // Attempt to resolve via wildcard re-exports
    const wildcards = imports.filter((index) => /^export\s+\*(?!\s+as)/.test(code.slice(index.ss, index.s)));

    if (wildcards.length === 1) {
        const first = wildcards[0];
        const name = first?.n;
        const resolveId = name ? (await context.resolve(name, id))?.id : undefined;

        if (!resolveId) {
            return { exportName, id, resolved: false };
        }

        const inner = await resolveThroughBarrel(context, resolveId, exportName, options);

        if (inner.resolved) {
            return inner;
        }
    } else if (wildcards.length > 1) {
        const returnValue = await Promise.all(
            wildcards.map(async (wc) => {
                const module_ = wc.n;
                const resolveId = module_ ? (await context.resolve(module_, id))?.id : undefined;

                if (!resolveId) {
                    return undefined;
                }

                return resolveThroughBarrel(context, resolveId, exportName, options);
            }),
        );

        const selected = returnValue.find((wc) => wc?.resolved);

        if (selected) {
            return selected as ResolvedSource;
        }
    }

    return { exportName, id, resolved: false };
};

const getDeclarationClause = (resolvedSource: ResolvedSource, importName: ImportName, declarationKind: "import" | "export") => {
    const { aliasedImportName, exportName } = resolvedSource;
    const local = importName.local || importName.imported;

    if (aliasedImportName) {
        return `{${aliasedImportName}}`;
    }

    if (exportName === "default" && declarationKind !== "export") {
        return local;
    }

    const isLocallyAliased = exportName !== local;

    return `{${isLocallyAliased ? `${exportName} as ${local}` : exportName}}`;
};

const getDebarrelModifications = async (context: DebarrelContext, id: string, code: string, options: DebarrelPluginOptions, logger: Console) => {
    const modifications: Modifications = [];
    const { imports } = await safeParse(id, code, logger);

    await Promise.all(
        imports.map(async (imp) => {
            if (!imp.n || imp.d !== -1) {
                return;
            }

            const specifiers = code.slice(imp.ss, imp.s);
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
                        const debarrelled = await resolveThroughBarrel(context, resolvedId, importName.imported, options);

                        if (!debarrelled) {
                            return undefined;
                        }

                        const clause = getDeclarationClause(debarrelled, importName, declarationKind);
                        const moduleSpecifier = JSON.stringify(debarrelled.id);

                        return `${declarationKind} ${clause} from ${moduleSpecifier}`;
                    }),
                );

                if (replacements.includes(undefined)) {
                    return;
                }

                modifications.push([imp.ss, imp.se, replacements.join(";")]);
            } catch (error) {
                logger.warn({
                    context: {
                        error,
                    },
                    message: error.toString(),
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
        map: sourceMap ? (out.generateMap({ file: id }) as any) : undefined,
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

    let sourceMap = true;

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
            // @ts-expect-error rollup types
            const sm
                = inputOptions.output && (Array.isArray(inputOptions.output) ? inputOptions.output[0]?.sourcemap : (inputOptions.output as any)?.sourcemap);

            if (sm === false) {
                sourceMap = false;
            }

            return undefined;
        },

        async transform(code, id) {
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

            return applyModifications(id, code, modifications, sourceMap);
        },

        watchChange(id) {
            fileCache.delete(id);
            parseCache.delete(id);
        },
    };
};
