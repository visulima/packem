/* eslint-disable consistent-return, sonarjs/cognitive-complexity, import/exports-last, @typescript-eslint/no-non-null-assertion, @typescript-eslint/prefer-nullish-coalescing, no-await-in-loop, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-use-before-define, no-param-reassign, @typescript-eslint/no-dynamic-delete, unicorn/prevent-abbreviations, unicorn/no-await-expression-member, unicorn/no-null, @typescript-eslint/restrict-template-expressions, no-plusplus, @stylistic/no-extra-parens, jsdoc/check-indentation, jsdoc/match-description, import/no-commonjs -- this file orchestrates the dts generation pipeline; rule-by-rule refactoring would obscure the control flow and many `any` usages stem from JSON.parse / rollup internal types */
import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { parse } from "@babel/parser";
import type { TSPropertySignature } from "@babel/types";
import { createFilter } from "@rollup/pluginutils";
import type { BirpcReturn } from "birpc";
import { createDebug } from "obug";
import { isolatedDeclarationSync, transformSync } from "oxc-transform";
import type { ExistingRawSourceMap, Plugin, SourceMapInput } from "rollup";

import { filenameToDts, RE_DTS, RE_DTS_MAP, RE_JS, RE_JSON, RE_NODE_MODULES, RE_TS, RE_VUE, replaceTemplateName, resolveTemplateFunction } from "./filename";
import type { OptionsResolved } from "./options";
import type { TscContext } from "./tsc/context";
import { createContext, globalContext, invalidateContextFile } from "./tsc/context";
import type { TscOptions, TscResult } from "./tsc/index";
import type { TscFunctions } from "./tsc/worker";
import { runTsgo } from "./tsgo";

const debug = createDebug("rollup-plugin-dts:generate");

// `WORKER_URL` is injected at build time; it is not part of the standard `ImportMeta`.
const WORKER_URL: string = (import.meta as ImportMeta & { WORKER_URL?: string }).WORKER_URL ?? "./tsc/worker.js";

export interface TsModule {
    /** `.ts` source code */
    code: string;
    /** `.ts` file name */
    id: string;
    isEntry: boolean;
}
/** dts filename -> ts module */
export type DtsMap = Map<string, TsModule>;

export const createGeneratePlugin = ({
    build,
    cwd,
    eager,
    emitDtsOnly,
    emitJs,
    entry,
    exclude,
    include,
    incremental,
    newContext,
    oxc,
    parallel,
    sourcemap,
    tsconfig,
    tsconfigRaw,
    tsgo,
    tsMacro,
    vue,
}: Pick<
    OptionsResolved,
    | "cwd"
    | "tsconfig"
    | "tsconfigRaw"
    | "build"
    | "incremental"
    | "oxc"
    | "emitDtsOnly"
    | "vue"
    | "tsMacro"
    | "parallel"
    | "eager"
    | "tsgo"
    | "newContext"
    | "emitJs"
    | "sourcemap"
    | "include"
    | "exclude"
    | "entry"
>): Plugin => {
    const filter = include || exclude ? createFilter(include, exclude) : null;

    // `entry` lets the user restrict which entry files emit `.d.ts` chunks via globs,
    // with `!`-prefixed negation patterns. Patterns are matched against paths relative
    // to `cwd`, normalized to forward slashes so a `src/index.ts`-style glob works on
    // Windows too. When unset, rollup's own entry detection is used.
    const entryIncludes = entry?.filter((p) => p[0] !== "!");
    const entryIgnores = entry?.filter((p) => p[0] === "!").map((p) => p.slice(1));
    const entryMatcher = entry
        ? (file: string): boolean => {
            const normalized = file.split(path.sep).join("/");

            // eslint-disable-next-line n/no-unsupported-features/node-builtins -- path.posix.matchesGlob is available on all supported Node versions (>=22.14)
            return entryIncludes!.some((p) => path.posix.matchesGlob(normalized, p)) && !entryIgnores!.some((p) => path.posix.matchesGlob(normalized, p));
        }
        : undefined;
    const dtsMap: DtsMap = new Map<string, TsModule>();

    // Maintained incrementally by the transform hook so the (non-eager) tsc load path
    // does not rebuild the full entries array from `dtsMap` on every module load
    // (which is O(n) per load and O(n^2) over the build).
    const entryIds = new Set<string>();

    /**
     * A map of input id to output file name
     * @example
     *
     * inputAlias = new Map([
     *   ['/absolute/path/to/src/source_file.ts', 'dist/foo/index'],
     * ])
     */
    const inputAliasMap = new Map<string, string>();

    // let isWatch = false
    let childProcess: ChildProcess | undefined;
    let rpc: BirpcReturn<TscFunctions> | undefined;
    let tscModule: typeof import("./tsc/index.ts");
    let tscContext: TscContext | undefined;
    let tsgoDist: string | undefined;
    const rootDir = tsconfig ? path.dirname(tsconfig) : cwd;

    return {
        async buildEnd() {
            childProcess?.kill();

            if (!debug.enabled && tsgoDist) {
                await rm(tsgoDist, { force: true, recursive: true }).catch(() => {});
            }

            tsgoDist = undefined;

            if (newContext) {
                tscContext = undefined;
            }
        },

        async buildStart(options) {
            // isWatch = this.meta.watchMode

            if (tsgo) {
                tsgoDist = await runTsgo(rootDir, tsconfig, sourcemap, tsgo.path);
            } else if (!oxc) {
                // tsc
                if (parallel) {
                    childProcess = fork(new URL(WORKER_URL, import.meta.url), {
                        stdio: "inherit",
                    });

                    await new Promise<void>((resolve, reject) => {
                        childProcess!.once("spawn", () => {
                            resolve();
                        });
                        childProcess!.once("error", (error) => {
                            reject(new Error(`Failed to start the parallel tsc worker: ${error.message}`, { cause: error }));
                        });
                    });

                    rpc = (await import("birpc")).createBirpc<TscFunctions>(
                        {},
                        {
                            on: (function_) => childProcess!.on("message", function_),
                            post: (data) => childProcess!.send(data),
                        },
                    );
                } else {
                    tscModule = await import("./tsc/index.js");

                    if (newContext) {
                        tscContext = createContext();
                    }
                }
            }

            if (!Array.isArray(options.input)) {
                for (const [name, id] of Object.entries(options.input)) {
                    debug("resolving input alias %s -> %s", name, id);
                    let resolved = await this.resolve(id);

                    if (!id.startsWith("./")) {
                        resolved ||= await this.resolve(`./${id}`);
                    }

                    const resolvedId = resolved?.id || id;

                    debug("resolved input alias %s -> %s", id, resolvedId);
                    inputAliasMap.set(resolvedId, name);
                }
            }
        },

        generateBundle(_options, bundle) {
            for (const fileName of Object.keys(bundle)) {
                const chunk = bundle[fileName];

                if (!chunk)
                    continue;

                // Strip names and sourcesContent from DTS sourcemap assets (works for both generate() and write())
                if (chunk.type === "asset" && RE_DTS_MAP.test(fileName) && typeof chunk.source === "string") {
                    const map = JSON.parse(chunk.source) as ExistingRawSourceMap;

                    map.names = [];
                    delete map.sourcesContent;
                    chunk.source = JSON.stringify(map);
                }

                if (emitDtsOnly && chunk.type === "chunk" && !RE_DTS.test(fileName) && !RE_DTS_MAP.test(fileName)) {
                    delete bundle[fileName];
                }
            }
        },

        load: {
            filter: {
                id: {
                    exclude: [RE_NODE_MODULES],
                    include: [RE_DTS],
                },
            },
            async handler(dtsId) {
                if (!dtsMap.has(dtsId))
                    return;

                const { code, id } = dtsMap.get(dtsId)!;
                let dtsCode: string | undefined;
                let map: SourceMapInput | undefined;

                debug("generate dts %s from %s", dtsId, id);

                if (tsgo) {
                    if (RE_VUE.test(id))
                        throw new Error("tsgo does not support Vue files.");

                    const dtsPath = path.resolve(tsgoDist!, path.relative(rootDir, filenameToDts(id)));

                    if (existsSync(dtsPath)) {
                        dtsCode = await readFile(dtsPath, "utf8");

                        if (sourcemap) {
                            const mapPath = `${dtsPath}.map`;

                            if (existsSync(mapPath)) {
                                const tsgoMap = JSON.parse(await readFile(mapPath, "utf8")) as SourceMapInput & { sources?: string[] };

                                // tsgo writes the map into an OS temp dir, so its `sources` are
                                // relative to that dir whose depth varies by platform (/tmp vs
                                // /var/folders/...). Resolve them against the map's real location
                                // to recover absolute source paths; rollup then rebases them to a
                                // stable output-relative form, matching the oxc/tsc backends.
                                if (Array.isArray(tsgoMap.sources)) {
                                    const mapDirectory = path.dirname(mapPath);

                                    tsgoMap.sources = tsgoMap.sources.map((source) => (source == null ? source : path.resolve(mapDirectory, source)));
                                }

                                map = tsgoMap;
                            }
                        }
                    } else {
                        debug("[tsgo]", dtsPath, "is missing");
                        throw new Error(`tsgo did not generate dts file for ${id}, please check your tsconfig.`);
                    }
                } else if (oxc && !RE_VUE.test(id)) {
                    const result = isolatedDeclarationSync(id, code, oxc);

                    if (result.errors.length > 0) {
                        const [first] = result.errors;
                        const total = result.errors.length;

                        // Report every isolated-declaration violation in a single pass so a file
                        // with N errors doesn't require N build cycles to surface them all. The
                        // first error keeps a structured `frame` for editor integrations; the rest
                        // are appended to the message text.
                        const header = total === 1 ? "isolated declarations error" : `${total} isolated declarations errors`;
                        const body = result.errors
                            .map((error, index) => {
                                const message = error?.message ?? "Unknown error";

                                return error?.codeframe ? `${index + 1}. ${message}\n${error.codeframe}` : `${index + 1}. ${message}`;
                            })
                            .join("\n\n");

                        return this.error({
                            frame: first?.codeframe || undefined,
                            message: `${header} in ${id}:\n\n${body}`,
                        });
                    }

                    dtsCode = result.code;

                    if (result.map) {
                        result.map.sourcesContent = undefined;
                        // DTS sourcemaps should not contain names
                        result.map.names = [];
                        map = result.map;
                    }
                } else {
                    const entries = eager ? undefined : [...entryIds];
                    const options: Omit<TscOptions, "programs"> = {
                        build,
                        context: tscContext,
                        cwd,
                        entries,
                        id,
                        incremental,
                        sourcemap,
                        tsconfig,
                        tsconfigRaw,
                        tsMacro,
                        vue,
                    };
                    let result: TscResult;

                    if (parallel) {
                        if (!rpc) {
                            return this.error(new Error("Parallel tsc worker is not initialized"));
                        }

                        result = await rpc.tscEmit(options);
                    } else {
                        result = tscModule.tscEmit(options);
                    }

                    if (result.error) {
                        return this.error(result.error);
                    }

                    dtsCode = result.code;
                    map = result.map;

                    if (dtsCode && RE_JSON.test(id)) {
                        // if contains invalid json keys
                        if (dtsCode.includes("declare const _exports")) {
                            if (dtsCode.includes("declare const _exports: {") && !dtsCode.includes("\n}[];")) {
                                // patch: add named export
                                const exports = collectJsonExports(dtsCode);
                                let i = 0;

                                dtsCode += exports
                                    .map((e) => {
                                        const valid = `_${e.replaceAll(/[^\w$]/g, "_")}${i++}`;
                                        const jsonKey = JSON.stringify(e);

                                        return `declare let ${valid}: typeof _exports[${jsonKey}]\nexport { ${valid} as ${jsonKey} }`;
                                    })
                                    .join("\n");
                            }
                        } else {
                            // patch: add default export
                            const exportMap = collectJsonExportMap(dtsCode);

                            dtsCode += `
declare namespace __json_default_export {
  export { ${Array.from(exportMap.entries(), ([exported, local]) => (exported === local ? exported : `${local} as ${exported}`)).join(", ")} }
}
export { __json_default_export as default }`;
                        }
                    }
                }

                return {
                    code: dtsCode || "",
                    map,
                };
            },
        },

        name: "rollup-plugin-dts:generate",

        outputOptions(options) {
            return {
                ...options,
                entryFileNames(chunk) {
                    const { entryFileNames } = options;
                    const nameTemplate = resolveTemplateFunction(entryFileNames || "[name].js", chunk);

                    if (chunk.name.endsWith(".d")) {
                        if (RE_DTS.test(nameTemplate)) {
                            return replaceTemplateName(nameTemplate, chunk.name.slice(0, -2));
                        }

                        if (RE_JS.test(nameTemplate)) {
                            return nameTemplate.replace(RE_JS, ".$1ts");
                        }
                    } else if (emitDtsOnly) {
                        // If this chunk's facade module is a .d.ts file, it is a direct DTS
                        // entry (no .ts source). Give it a proper DTS extension so
                        // generateBundle does not delete it.
                        if (chunk.facadeModuleId && RE_DTS.test(chunk.facadeModuleId)) {
                            if (RE_DTS.test(nameTemplate)) {
                                return replaceTemplateName(nameTemplate, chunk.name);
                            }

                            if (RE_JS.test(nameTemplate)) {
                                return nameTemplate.replace(RE_JS, ".$1ts");
                            }
                        }

                        // Fake JS entry in emitDtsOnly mode — give it a non-DTS name so it never
                        // conflicts with the real emitted DTS chunk (name `${name}.d`).
                        return replaceTemplateName("[name].js", chunk.name);
                    }

                    return nameTemplate;
                },
            };
        },

        async resolveId(id, importer) {
            if (dtsMap.has(id)) {
                debug("resolve dts id %s", id);

                return { id };
            }

            // Handle rollup cache re-resolution: on a second build, rollup restores its
            // cache which contains previously emitted .d.ts chunks. It tries to re-resolve
            // them before the transform hook has populated dtsMap. Since rollup may use
            // cached transform results (skipping the transform hook), we populate dtsMap
            // directly from the source file.
            // The id may be absolute or relative (rollup may store relative paths in cache).
            if (!importer && RE_DTS.test(id) && !RE_NODE_MODULES.test(id)) {
                const absoluteId = path.isAbsolute(id) ? id : path.resolve(cwd, id);
                // Map `.d.ts` / `.d.mts` / `.d.cts` back to ALL plausible source extensions.
                // A `.d.ts` entry may come from `.ts`, `.tsx`, `.mts`, or `.cts` — the naive
                // replace(`.d.$1ts`, `.$1ts`) only preserves the original modifier (none / m / c)
                // and misses `.tsx`, which is a legitimate React/JSX source extension that the
                // inferred-entries pipeline maps to `.d.ts`.
                const stripped = absoluteId.replace(RE_DTS, "");
                const candidates = [absoluteId.replace(RE_DTS, ".$1ts"), `${stripped}.tsx`, `${stripped}.ts`, `${stripped}.mts`, `${stripped}.cts`];

                if (!dtsMap.has(absoluteId)) {
                    for (const tsId of candidates) {
                        if (existsSync(tsId)) {
                            // Rollup may skip transform hook for cached modules whose source hasn't changed.
                            // Populate dtsMap directly from the source file so the load hook can serve it.
                            const code = readFileSync(tsId, "utf8");

                            dtsMap.set(absoluteId, { code, id: tsId, isEntry: true });
                            entryIds.add(tsId);
                            debug("populated dtsMap from source for cached re-resolution: %s (via %s)", absoluteId, tsId);
                            break;
                        }
                    }
                }

                if (dtsMap.has(absoluteId)) {
                    debug("resolve dts id %s (from cache re-resolution)", absoluteId);

                    return { id: absoluteId };
                }

                return null;
            }

            // Try TypeScript extensions when rollup can't resolve a relative import.
            // This is needed because rollup doesn't natively understand .ts files.
            if (importer && RE_TS.test(importer) && (id.startsWith("./") || id.startsWith("../")) && !path.extname(id)) {
                for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
                    const resolved = await this.resolve(id + extension, importer, { skipSelf: true });

                    if (resolved)
                        return resolved;
                }
            }

            return null;
        },

        shouldTransformCachedModule({ id }) {
            // Force re-transformation for ALL .d.ts modules so the fake-js plugin's
            // internal `declarationMap` / `moduleExportsMap` is re-populated on every
            // build. fake-js's `renderChunk` reads state that only its `transform`
            // populates; if rollup serves a cached transform result, the state is
            // empty and renderChunk crashes with `Cannot read properties of
            // undefined (reading 'decl')`. That previously slipped through for
            // inlined node_modules .d.ts — e.g. yaml / indent-string — because the
            // old exclusion kept them cached. Re-transforming .d.ts is cheap (no
            // TS compilation, just a single parse + AST walk) and correctness
            // matters more than the skip here.
            return RE_DTS.test(id);
        },

        transform: {
            handler(code, id) {
                // Bundler-injected virtual modules (rolldown's
                // \0rolldown/runtime.js, rollup convention \0...) must pass
                // through untouched: emitDtsOnly's "export { }" replacement
                // would strip their runtime exports and break linking.
                if (id.startsWith("\0"))
                    return;

                if (RE_DTS.test(id) || RE_NODE_MODULES.test(id))
                    return;

                if (filter && !filter(id))
                    return;

                const shouldEmit = !RE_JS.test(id) || emitJs;

                if (shouldEmit) {
                    // `entry` only *filters* rollup's detected entry points — it never
                    // promotes a non-entry module to an entry (a broad glob like `**`
                    // must not turn internal/transitive modules into emitted chunks).
                    const rollupIsEntry = !!this.getModuleInfo(id)?.isEntry;
                    const isEntry = entryMatcher ? rollupIsEntry && entryMatcher(path.relative(cwd, id)) : rollupIsEntry;
                    const dtsId = filenameToDts(id);

                    dtsMap.set(dtsId, { code, id, isEntry });
                    debug("register dts source: %s", id);

                    if (isEntry) {
                        entryIds.add(id);

                        const name = inputAliasMap.get(id);

                        this.emitFile({
                            id: dtsId,
                            name: name ? `${name}.d` : undefined,
                            type: "chunk",
                        });
                    } else {
                        entryIds.delete(id);
                    }
                }

                if (emitDtsOnly) {
                    if (RE_JSON.test(id))
                        return "{}";

                    return "export { }";
                }

                // Strip TypeScript types so rollup can parse the file as JavaScript.
                // In rolldown, TypeScript is natively supported; in rollup it is not.
                if (RE_TS.test(id) || RE_VUE.test(id)) {
                    const result = transformSync(id, code, {});

                    return result.code;
                }

                return null;
            },
            order: "pre",
        },

        watchChange(id) {
            if (tscModule) {
                invalidateContextFile(tscContext || globalContext, id);
            }
        },
    };
};

const collectJsonExportMap = (code: string): Map<string, string> => {
    const exportMap = new Map<string, string>();
    const { program } = parse(code, {
        errorRecovery: true,
        plugins: [["typescript", { dts: true }]],
        sourceType: "module",
    });

    for (const decl of program.body) {
        if (decl.type === "ExportNamedDeclaration") {
            // export declare let Hello: string;
            if (decl.declaration) {
                if (decl.declaration.type === "VariableDeclaration") {
                    for (const vdecl of decl.declaration.declarations) {
                        if (vdecl.id.type === "Identifier") {
                            exportMap.set(vdecl.id.name, vdecl.id.name);
                        }
                    }
                } else if (decl.declaration.type === "TSModuleDeclaration" && decl.declaration.id.type === "Identifier") {
                    exportMap.set(decl.declaration.id.name, decl.declaration.id.name);
                }
            } else if (decl.specifiers.length > 0) {
                for (const spec of decl.specifiers) {
                    if (spec.type === "ExportSpecifier" && spec.exported.type === "Identifier") {
                        // declare let _class: string
                        // export { _class as class }
                        exportMap.set(spec.exported.name, spec.local.type === "Identifier" ? spec.local.name : spec.exported.name);
                    }
                }
            }
        }
    }

    return exportMap;
};

/** `declare const _exports` mode */
const collectJsonExports = (code: string) => {
    const exports: string[] = [];
    const { program } = parse(code, {
        plugins: [["typescript", { dts: true }]],
        sourceType: "module",
    });
    const [firstStatement] = program.body;
    const declarator = firstStatement?.type === "VariableDeclaration" ? firstStatement.declarations[0] : undefined;
    const typeAnnotation = declarator?.id.type === "Identifier" ? declarator.id.typeAnnotation : undefined;
    const typeLiteral
        = typeAnnotation?.type === "TSTypeAnnotation" && typeAnnotation.typeAnnotation.type === "TSTypeLiteral" ? typeAnnotation.typeAnnotation : undefined;
    const members = typeLiteral?.members as TSPropertySignature[] | undefined;

    if (!Array.isArray(members)) {
        throw new TypeError(
            "rollup-plugin-dts: unexpected JSON declaration shape — expected `declare const _exports: { ... }` with an object type literal. The emitted dts may have changed; cannot extract named exports.",
        );
    }

    for (const member of members) {
        if (member.key.type === "Identifier") {
            exports.push(member.key.name);
        } else if (member.key.type === "StringLiteral") {
            exports.push(member.key.value);
        }
    }

    return exports;
};
