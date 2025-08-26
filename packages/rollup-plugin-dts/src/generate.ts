import type { ChildProcess } from "node:child_process";
import { fork, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { relative, resolve } from "@visulima/path";
import type { BirpcReturn } from "birpc";
import Debug from "debug";
import { isolatedDeclaration as oxcIsolatedDeclaration } from "rolldown/experimental";
import type { Plugin, SourceMapInput } from "rollup";

import {
    filename_to_dts,
    RE_DTS,
    RE_DTS_MAP,
    RE_JS,
    RE_NODE_MODULES,
    RE_TS,
    RE_VUE,
    replaceTemplateName,
    resolveTemplateFn as resolveTemplateFunction,
} from "./filename";
import type { OptionsResolved } from "./options";
import type { TscContext } from "./tsc/context";
import {
    createContext,
    globalContext,
    invalidateContextFile,
} from "./tsc/context";
import type { TscOptions, TscResult } from "./tsc/index";
import type { TscFunctions } from "./tsc/worker";

const debug = Debug("rolldown-plugin-dts:generate");

const WORKER_URL = import.meta.WORKER_URL || "./tsc/worker";

const spawnAsync = (...arguments_: Parameters<typeof spawn>) =>
    new Promise<void>((resolve, reject) => {
        const child = spawn(...arguments_);

        child.on("close", () => resolve());
        child.on("error", (error) => reject(error));
    });

export interface TsModule {
    /** `.ts` source code */
    code: string;
    /** `.ts` file name */
    id: string;
    isEntry: boolean;
}
/** dts filename -> ts module */
export type DtsMap = Map<string, TsModule>;

export function createGeneratePlugin({
    build,
    cwd,
    eager,
    emitDtsOnly,
    emitJs,
    incremental,
    newContext,
    oxc,
    parallel,
    tsconfig,
    tsconfigRaw,
    tsgo,
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
    | "parallel"
    | "eager"
    | "tsgo"
    | "newContext"
    | "emitJs"
>): Plugin {
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
    let tsgoDistribution: string | undefined;

    return {
        async buildEnd() {
            childProcess?.kill();

            if (!debug.enabled && tsgoDistribution) {
                await rm(tsgoDistribution, { force: true, recursive: true }).catch(() => {});
            }

            tsgoDistribution = undefined;

            if (newContext) {
                tscContext = undefined;
            }
        },

        async buildStart(options) {
            // isWatch = this.meta.watchMode

            if (tsgo) {
                tsgoDistribution = await runTsgo(cwd, tsconfig);
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
                    tscModule = await import("./tsc/index.ts");

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

        generateBundle: emitDtsOnly
            ? (options, bundle) => {
                for (const fileName of Object.keys(bundle)) {
                    if (
                        bundle[fileName].type === "chunk"
                        && !RE_DTS.test(fileName)
                        && !RE_DTS_MAP.test(fileName)
                    ) {
                        delete bundle[fileName];
                    }
                }
            }
            : undefined,

        load: {
            filter: {
                id: {
                    exclude: [RE_NODE_MODULES],
                    include: [RE_DTS],
                },
            },
            async handler(dtsId) {
                if (!dtsMap.has(dtsId)) { return; }

                const { code, id } = dtsMap.get(dtsId)!;
                let dtsCode: string | undefined;
                let map: SourceMapInput | undefined;

                debug("generate dts %s from %s", dtsId, id);

                if (tsgo) {
                    if (RE_VUE.test(id)) { throw new Error("tsgo does not support Vue files."); }

                    const dtsPath = resolve(
                        tsgoDistribution!,
                        relative(resolve(cwd), filename_to_dts(id)),
                    );

                    if (existsSync(dtsPath)) {
                        dtsCode = await readFile(dtsPath, "utf8");
                    } else {
                        debug("[tsgo]", dtsPath, "is missing");
                        throw new Error(
                            `tsgo did not generate dts file for ${id}, please check your tsconfig.`,
                        );
                    }
                } else if (oxc && !RE_VUE.test(id)) {
                    const result = oxcIsolatedDeclaration(id, code, oxc);

                    if (result.errors.length > 0) {
                        const [error] = result.errors;

                        return this.error({
                            frame: error.codeframe,
                            message: error.message,
                        });
                    }

                    dtsCode = result.code;

                    if (result.map) {
                        map = result.map;
                        map.sourcesContent = undefined;
                    }
                } else {
                    const entries = eager
                        ? undefined
                        : [...dtsMap.values()]
                            .filter((v) => v.isEntry)
                            .map((v) => v.id);
                    const options: Omit<TscOptions, "programs"> = {
                        build,
                        context: tscContext,
                        cwd,
                        entries,
                        id,
                        incremental,
                        tsconfig,
                        tsconfigRaw,
                        vue,
                    };
                    let result: TscResult;

                    result = parallel ? await rpc!.tscEmit(options) : tscModule.tscEmit(options);

                    if (result.error) {
                        return this.error(result.error);
                    }

                    dtsCode = result.code;
                    map = result.map;
                }

                return {
                    code: dtsCode || "",
                    map,
                    moduleSideEffects: false,
                };
            },
        },

        name: "rolldown-plugin-dts:generate",

        outputOptions(options) {
            return {
                ...options,
                entryFileNames(chunk) {
                    const { entryFileNames } = options;
                    const nameTemplate = resolveTemplateFunction(
                        entryFileNames || "[name].js",
                        chunk,
                    );

                    if (chunk.name.endsWith(".d")) {
                        if (RE_DTS.test(nameTemplate)) {
                            return replaceTemplateName(nameTemplate, chunk.name.slice(0, -2));
                        }

                        if (RE_JS.test(nameTemplate)) {
                            return nameTemplate.replace(RE_JS, ".$1ts");
                        }
                    }

                    return nameTemplate;
                },
            };
        },

        resolveId(id) {
            if (dtsMap.has(id)) {
                debug("resolve dts id %s", id);

                return { id };
            }
        },

        transform: {
            filter: {
                id: {
                    exclude: [RE_DTS, RE_NODE_MODULES],
                    include: [RE_JS, RE_TS, RE_VUE],
                },
            },
            handler(code, id) {
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
                    return "export { }";
                }
            },
            order: "pre",
        },

        watchChange(id) {
            if (tscModule) {
                invalidateContextFile(tscContext || globalContext, id);
            }
        },
    };
}

async function runTsgo(root: string, tsconfig?: string) {
    const tsgoPackage = import.meta.resolve("@typescript/native-preview/package.json");
    const { default: getExePath } = await import(
        new URL("lib/getExePath.js", tsgoPackage).href
    );
    const tsgo = getExePath();
    const tsgoDistribution = await mkdtemp(join(tmpdir(), "rolldown-plugin-dts-"));

    debug("[tsgo] tsgoDist", tsgoDistribution);

    await spawnAsync(
        tsgo,
        [
            "--noEmit",
            "false",
            "--declaration",
            "--emitDeclarationOnly",
            ...tsconfig ? ["-p", tsconfig] : [],
            "--outDir",
            tsgoDistribution,
            "--rootDir",
            root,
            "--noCheck",
        ],
        { stdio: "inherit" },
    );

    return tsgoDistribution;
}
