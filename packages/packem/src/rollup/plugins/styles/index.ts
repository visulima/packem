import { createFilter } from "@rollup/pluginutils";
import { basename, dirname, parse, resolve } from "@visulima/path";
import cssnano from "cssnano";
import type { OutputAsset, OutputChunk, Plugin } from "rollup";

import type { Environment } from "../../../types";
import Loaders from "./loaders";
import type { Extracted, LoaderContext } from "./loaders/types";
import type { ExtractedData, InternalStyleOptions, StyleOptions } from "./types";
import concat from "./utils/concat";
import { ensurePCSSOption, ensurePCSSPlugins, inferHandlerOption, inferModeOption, inferOption, inferSourceMapOption } from "./utils/options";
import { humanlizePath, isAbsolutePath, isRelativePath, normalizePath } from "./utils/path";
import { mm } from "./utils/sourcemap";

// eslint-disable-next-line sonarjs/cognitive-complexity
export default (options: StyleOptions, cwd: string, environment: Environment): Plugin => {
    const isIncluded = createFilter(options.include, options.exclude);

    const sourceMap = inferSourceMapOption(options.sourceMap);
    const loaderOptions: InternalStyleOptions = {
        ...inferModeOption(options.mode),
        dts: options.dts ?? false,
        extensions: options.extensions ?? [".css", ".pcss", ".postcss", ".sss"],
        import: inferHandlerOption(options.import, options.alias),
        minimize: inferOption(options.minimize, false),
        namedExports: options.namedExports ?? false,
        postcss: {
            autoModules: options.postcss?.autoModules ?? false,
            config: inferOption(options.postcss?.config, {}),
            modules: inferOption(options.postcss?.modules, false),
            to: options.postcss?.to,
        },
        url: inferHandlerOption(options.url, options.alias),
    };

    if (typeof loaderOptions.inject === "object" && loaderOptions.inject.treeshakeable && loaderOptions.namedExports) {
        throw new Error("`inject.treeshakeable` option is incompatible with `namedExports` option");
    }

    if (options.postcss?.parser) {
        loaderOptions.postcss.parser = ensurePCSSOption(options.postcss.parser, "parser");
    }

    if (options.postcss?.syntax) {
        loaderOptions.postcss.syntax = ensurePCSSOption(options.postcss.syntax, "syntax");
    }

    if (options.postcss?.stringifier) {
        loaderOptions.postcss.stringifier = ensurePCSSOption(options.postcss.stringifier, "stringifier");
    }

    if (options.postcss?.plugins) {
        loaderOptions.postcss.plugins = ensurePCSSPlugins(options.postcss.plugins);
    }

    const loaders = new Loaders({
        extensions: loaderOptions.extensions,
        loaders: options.loaders ?? [],
        options: {
            ...options,
            ...loaderOptions,
        },
    });

    let extracted: Extracted[] = [];

    return {
        augmentChunkHash(chunk) {
            if (extracted.length === 0) {
                return;
            }

            const ids: string[] = [];

            for (const module of Object.keys(chunk.modules)) {
                const traversed = new Set<string>();

                let current = [module];

                do {
                    const imports: string[] = [];

                    for (const id of current) {
                        if (traversed.has(id)) {
                            // eslint-disable-next-line no-continue
                            continue;
                        }

                        if (loaders.isSupported(id)) {
                            if (isIncluded(id)) {
                                imports.push(id);
                            }

                            // eslint-disable-next-line no-continue
                            continue;
                        }

                        traversed.add(id);

                        const index = this.getModuleInfo(id);

                        if (index) {
                            imports.push(...index.importedIds);
                        }
                    }

                    current = imports;
                } while (current.some((id) => !loaders.isSupported(id)));

                ids.push(...current);
            }

            const hashable = extracted
                .filter((e) => ids.includes(e.id))
                .sort((a, b) => ids.lastIndexOf(a.id) - ids.lastIndexOf(b.id))
                .map((e) => `${basename(e.id)}:${e.css}`);

            if (hashable.length === 0) {
                return;
            }

            return hashable.join(":");
        },

        async generateBundle(options_, bundle) {
            if (extracted.length === 0 || !(options_.dir || options_.file)) {
                return;
            }

            const directory = options_.dir ?? dirname(options_.file!);
            const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === "chunk");
            const manual = chunks.filter((c) => !c.facadeModuleId);
            const emitted = options_.preserveModules ? chunks : chunks.filter((c) => c.isEntry || c.isDynamicEntry);

            const emittedList: [string, string[]][] = [];

            const getExtractedData = async (name: string, ids: string[]): Promise<ExtractedData> => {
                const fileName =
                    typeof loaderOptions.extract === "string" ? normalizePath(loaderOptions.extract).replace(/^\.[/\\]/, "") : normalizePath(`${name}.css`);

                if (isAbsolutePath(fileName)) {
                    this.error(["Extraction path must be relative to the output directory,", `which is ${humanlizePath(directory)}`].join("\n"));
                }

                if (isRelativePath(fileName)) {
                    this.error(["Extraction path must be nested inside output directory,", `which is ${humanlizePath(directory)}`].join("\n"));
                }

                const entries = extracted.filter((e) => ids.includes(e.id)).sort((a, b) => ids.lastIndexOf(a.id) - ids.lastIndexOf(b.id));

                const result = await concat(entries);

                return {
                    css: result.css,
                    map: mm(result.map.toString())
                        .relative(dirname(resolve(directory, fileName)))
                        .toString(),
                    name: fileName,
                };
            };

            const getName = (chunk: OutputChunk): string => {
                if (options_.file) {
                    return parse(options_.file).name;
                }

                if (options_.preserveModules) {
                    const { dir, name } = parse(chunk.fileName);

                    return dir ? `${dir}/${name}` : name;
                }

                return chunk.name;
            };

            const getImports = (chunk: OutputChunk): string[] => {
                const ids: string[] = [];

                for (const module of Object.keys(chunk.modules)) {
                    const traversed = new Set<string>();

                    let current = [module];

                    do {
                        const imports: string[] = [];

                        for (const id of current) {
                            if (traversed.has(id)) {
                                // eslint-disable-next-line no-continue
                                continue;
                            }

                            if (loaders.isSupported(id)) {
                                if (isIncluded(id)) {
                                    imports.push(id);
                                }

                                // eslint-disable-next-line no-continue
                                continue;
                            }

                            traversed.add(id);

                            const index = this.getModuleInfo(id);

                            index && imports.push(...index.importedIds);
                        }

                        current = imports;
                    } while (current.some((id) => !loaders.isSupported(id)));

                    ids.push(...current);
                }

                return ids;
            };

            const moved: string[] = [];

            if (typeof loaderOptions.extract === "string") {
                const ids: string[] = [];

                for (const chunk of manual) {
                    const chunkIds = getImports(chunk);

                    moved.push(...chunkIds);
                    ids.push(...chunkIds);
                }

                for (const chunk of emitted) {
                    ids.push(...getImports(chunk).filter((id) => !moved.includes(id)));
                }

                const name = getName(chunks[0] as OutputChunk);

                emittedList.push([name, ids]);
            } else {
                for (const chunk of manual) {
                    const ids = getImports(chunk);

                    if (ids.length === 0) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    moved.push(...ids);

                    const name = getName(chunk);

                    emittedList.push([name, ids]);
                }

                for (const chunk of emitted) {
                    const ids = getImports(chunk).filter((id) => !moved.includes(id));

                    if (ids.length === 0) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    const name = getName(chunk);

                    emittedList.push([name, ids]);
                }
            }

            for await (const [name, ids] of emittedList) {
                const extractedData = await getExtractedData(name, ids);

                if (typeof options.onExtract === "function") {
                    const shouldExtract = options.onExtract(extractedData);

                    if (!shouldExtract) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }
                }

                // Perform minimization on the extracted file
                if (loaderOptions.minimize) {
                    const cssnanoOptions = typeof loaderOptions.minimize === "object" ? loaderOptions.minimize : {};
                    const minifier = cssnano(cssnanoOptions);

                    const resultMinified = await minifier.process(extractedData.css, {
                        from: extractedData.name,
                        map: sourceMap && {
                            annotation: false,
                            inline: false,
                            prev: extractedData.map,
                            sourcesContent: sourceMap.content,
                        },
                        to: extractedData.name,
                    });

                    extractedData.css = resultMinified.css;
                    extractedData.map = resultMinified.map.toString();
                }

                const cssFile = {
                    fileName: extractedData.name,
                    name: extractedData.name,
                    originalFileName: extractedData.name,
                    source: extractedData.css,
                    type: "asset" as const,
                };
                const cssFileId = this.emitFile(cssFile);

                if (extractedData.map && sourceMap) {
                    const fileName = this.getFileName(cssFileId);

                    const assetDirectory =
                        typeof options_.assetFileNames === "string"
                            ? normalizePath(dirname(options_.assetFileNames))
                            : typeof options_.assetFileNames === "function"
                              ? normalizePath(dirname(options_.assetFileNames(cssFile)))
                              : "assets"; // Default for Rollup v2

                    const map = mm(extractedData.map)
                        .modify((m) => (m.file = basename(fileName)))
                        .modifySources((s) => {
                            // Compensate for possible nesting depending on `assetFileNames` value
                            if (s === "<no source>") {
                                return s;
                            }

                            if (assetDirectory.length <= 1) {
                                return s;
                            }

                            s = `../${s}`; // ...then there's definitely at least 1 level offset

                            for (const c of assetDirectory) {
                                if (c === "/") {
                                    s = `../${s}`;
                                }
                            }

                            return s;
                        });

                    if (sourceMap.inline) {
                        map.modify((m) => sourceMap.transform?.(m, normalizePath(directory, fileName)));

                        (bundle[fileName] as OutputAsset).source += map.toCommentData();
                    } else {
                        const mapFileName = `${fileName}.map`;

                        map.modify((m) => sourceMap.transform?.(m, normalizePath(directory, mapFileName)));

                        this.emitFile({ fileName: mapFileName, source: map.toString(), type: "asset" });

                        const { base } = parse(mapFileName);

                        (bundle[fileName] as OutputAsset).source += map.toCommentFile(base);
                    }
                }
            }
        },

        name: "packem:styles",

        async transform(code, id) {
            if (!isIncluded(id) || !loaders.isSupported(id)) {
                return null;
            }

            // Skip empty files
            if (code.replaceAll(/\s/g, "") === "") {
                return null;
            }

            if (typeof options.onImport === "function") {
                options.onImport(code, id);
            }

            const context: LoaderContext = {
                assets: new Map<string, Uint8Array>(),
                deps: new Set(),
                id,
                options: {},
                plugin: this,
                sourceMap,
                warn: this.warn.bind(this),
            };

            const result = await loaders.process({ code }, context);

            for (const dep of context.deps) {
                this.addWatchFile(dep);
            }

            for (const [fileName, source] of context.assets) {
                this.emitFile({ fileName, source, type: "asset" });
            }

            if (result.extracted) {
                const { id } = result.extracted;

                extracted = extracted.filter((e) => e.id !== id);
                extracted.push(result.extracted);
            }

            return {
                code: result.code,
                map: sourceMap && result.map ? result.map : { mappings: "" as const },
                moduleSideEffects: result.extracted ? true : null,
            };
        },
    };
};
