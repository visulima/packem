import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { parse } from "@babel/parser";
import type { TSPropertySignature } from "@babel/types";
import type { BirpcReturn } from "birpc";
import { createDebug } from "obug";
import { isolatedDeclarationSync, transformSync } from "oxc-transform";
import { createFilter } from "@rollup/pluginutils";
import type { Plugin, SourceMapInput } from "rollup";

import {
    filename_to_dts,
    RE_DTS,
    RE_DTS_MAP,
    RE_JS,
    RE_JSON,
    RE_NODE_MODULES,
    RE_TS,
    RE_VUE,
    replaceTemplateName,
    resolveTemplateFn as resolveTemplateFunction,
} from "./filename";
import type { OptionsResolved } from "./options";
import type { TscContext } from "./tsc/context";
import { createContext, globalContext, invalidateContextFile } from "./tsc/context";
import type { TscOptions, TscResult } from "./tsc/index";
import type TscFunctions from "./tsc/worker";
import { runTsgo } from "./tsgo";

const debug = createDebug("rollup-plugin-dts:generate");

const WORKER_URL = (import.meta as any).WORKER_URL ?? "./tsc/worker.js";

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
>): Plugin => {
    const filter = include || exclude ? createFilter(include, exclude) : null;
    const dtsMap: DtsMap = new Map<string, TsModule>();

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
                if (chunk.type === "asset" && RE_DTS_MAP.test(fileName) && typeof (chunk as { source: unknown }).source === "string") {
                    const map = JSON.parse((chunk as { source: string }).source);

                    map.names = [];
                    delete map.sourcesContent;
                    (chunk as any).source = JSON.stringify(map);
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

                    const dtsPath = path.resolve(tsgoDist!, path.relative(rootDir, filename_to_dts(id)));

                    if (existsSync(dtsPath)) {
                        dtsCode = await readFile(dtsPath, "utf8");

                        if (sourcemap) {
                            const mapPath = `${dtsPath}.map`;

                            if (existsSync(mapPath)) {
                                map = JSON.parse(await readFile(mapPath, "utf8"));
                            }
                        }
                    } else {
                        debug("[tsgo]", dtsPath, "is missing");
                        throw new Error(`tsgo did not generate dts file for ${id}, please check your tsconfig.`);
                    }
                } else if (oxc && !RE_VUE.test(id)) {
                    const result = isolatedDeclarationSync(id, code, oxc);

                    if (result.errors.length > 0) {
                        const [error] = result.errors;

                        // Include codeframe in message so it appears in String(error)
                        return this.error({
                            frame: error?.codeframe || undefined,
                            message: error?.codeframe ? `${error.message}\n${error.codeframe}` : error?.message ?? "Unknown error",
                        });
                    }

                    dtsCode = result.code;

                    if (result.map) {
                        map = result.map;
                        map.sourcesContent = undefined;
                        // DTS sourcemaps should not contain names
                        (map as any).names = [];
                    }
                } else {
                    const entries = eager ? undefined : [...dtsMap.values()].filter((v) => v.isEntry).map((v) => v.id);
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

                    result = parallel ? await rpc!.tscEmit(options) : tscModule.tscEmit(options);

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
                const candidates = [
                    absoluteId.replace(RE_DTS, ".$1ts"),
                    `${stripped}.tsx`,
                    `${stripped}.ts`,
                    `${stripped}.mts`,
                    `${stripped}.cts`,
                ];

                if (!dtsMap.has(absoluteId)) {
                    for (const tsId of candidates) {
                        if (existsSync(tsId)) {
                            // Rollup may skip transform hook for cached modules whose source hasn't changed.
                            // Populate dtsMap directly from the source file so the load hook can serve it.
                            const code = readFileSync(tsId, "utf8");

                            dtsMap.set(absoluteId, { code, id: tsId, isEntry: true });
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
            // internal `declarationMap` / `typeOnlyMap` is re-populated on every
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
                if (RE_DTS.test(id) || RE_NODE_MODULES.test(id))
                    return;

                if (filter && !filter(id))
                    return;

                const shouldEmit = !RE_JS.test(id) || emitJs;

                if (shouldEmit) {
                    const module_ = this.getModuleInfo(id);
                    const isEntry = !!module_?.isEntry;
                    const dtsId = filename_to_dts(id);

                    dtsMap.set(dtsId, { code, id, isEntry });
                    debug("register dts source: %s", id);

                    if (isEntry) {
                        const name = inputAliasMap.get(id);

                        this.emitFile({
                            id: dtsId,
                            name: name ? `${name}.d` : undefined,
                            type: "chunk",
                        });
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
    const members = (program.body as any)[0].declarations[0].id.typeAnnotation.typeAnnotation.members as TSPropertySignature[];

    for (const member of members) {
        if (member.key.type === "Identifier") {
            exports.push(member.key.name);
        } else if (member.key.type === "StringLiteral") {
            exports.push(member.key.value);
        }
    }

    return exports;
};
