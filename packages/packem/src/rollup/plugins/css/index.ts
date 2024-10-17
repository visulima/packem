import { createFilter } from "@rollup/pluginutils";
import type { Pail } from "@visulima/pail";
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import type { GetModuleInfo, OutputAsset, OutputChunk, Plugin } from "rollup";

import type { Environment } from "../../../types";
import LoaderManager from "./loaders/loader";
import type { Extracted, Loader, LoaderContext } from "./loaders/types";
import type { ExtractedData, InternalStyleOptions, StyleOptions } from "./types";
import concat from "./utils/concat";
import { ensurePCSSOption, ensurePCSSPlugins, inferHandlerOption, inferModeOption, inferOption, inferSourceMapOption } from "./utils/options";
import { mm } from "./utils/sourcemap";

const sortByNameOrder = async (objectsArray: Loader[], nameOrder: string[]): Promise<Loader[]> =>
    // eslint-disable-next-line etc/no-assign-mutated-array
    objectsArray.sort((a, b) => nameOrder.indexOf(a.name) - nameOrder.indexOf(b.name));

export default async (
    options: StyleOptions,
    logger: Pail,
    browserTargets: string[],
    cwd: string,
    sourceDirectory: string,
    environment: Environment,
    useSourcemap: boolean,
    debug: boolean,
    alias: Record<string, string>,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<Plugin> => {
    const mergedAlias = { ...alias, ...options.alias };
    const isIncluded = createFilter(options.include, options.exclude);

    const sourceMap = inferSourceMapOption(options.sourceMap);
    const loaderOptions: NonNullable<InternalStyleOptions> = {
        ...inferModeOption(options.mode),
        autoModules: options.autoModules ?? false,
        dts: options.dts as boolean,
        extensions: options.extensions as string[],
        namedExports: options.namedExports as boolean,
    };

    if (typeof loaderOptions.inject === "object" && loaderOptions.inject.treeshakeable) {
        loaderOptions.namedExports = false;

        logger.info({
            message: "Disabling named exports due to `inject.treeshakeable` option",
            prefix: "css",
        });
    }

    let hasPostCssLoader = false;

    if (options.loaders) {
        for (const loader of options.loaders) {
            if (loader.name === "postcss") {
                hasPostCssLoader = true;
            }
        }
    } else {
        // eslint-disable-next-line no-param-reassign
        options.loaders = [];
    }

    if (hasPostCssLoader) {
        loaderOptions.postcss = {
            ...options.postcss,
            config: inferOption(options.postcss?.config, {}),
            import: inferHandlerOption(options.postcss?.import, mergedAlias),
            modules: inferOption(options.postcss?.modules, false),
            to: options.postcss?.to,
            url: inferHandlerOption(options.postcss?.url, mergedAlias),
        };

        if (options.postcss?.parser) {
            loaderOptions.postcss.parser = await ensurePCSSOption(options.postcss.parser, "parser", cwd);
        }

        if (options.postcss?.syntax) {
            loaderOptions.postcss.syntax = await ensurePCSSOption(options.postcss.syntax, "syntax", cwd);
        }

        if (options.postcss?.stringifier) {
            loaderOptions.postcss.stringifier = await ensurePCSSOption(options.postcss.stringifier, "stringifier", cwd);
        }

        if (options.postcss?.plugins) {
            loaderOptions.postcss.plugins = await ensurePCSSPlugins(options.postcss.plugins, cwd);
        }
    }

    const loaders = new LoaderManager({
        extensions: loaderOptions.extensions,
        loaders: await sortByNameOrder(options.loaders, ["sourcemap", "stylus", "less", "sass", "postcss"]),
        logger,
        options: {
            ...options,
            ...loaderOptions,
            alias: mergedAlias,
        },
    });

    let extracted: Extracted[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traverseImportedModules = (chunkModules: Record<string, any>, getModuleInfo: GetModuleInfo): string[] => {
        const ids: string[] = [];

        for (const module of Object.keys(chunkModules)) {
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

                    const index = getModuleInfo(id);

                    if (index) {
                        imports.push(...index.importedIds);
                    }
                }

                current = imports;
            } while (current.some((id) => !loaders.isSupported(id)));

            ids.push(...current);
        }
        return ids;
    };

    return <Plugin>{
        augmentChunkHash(chunk) {
            if (extracted.length === 0) {
                return null;
            }

            const ids = traverseImportedModules(chunk.modules, this.getModuleInfo);

            const hashable = extracted
                .filter((extract) => ids.includes(extract.id))
                .sort((a, b) => ids.lastIndexOf(a.id) - ids.lastIndexOf(b.id))
                .map((extract) => `${basename(extract.id)}:${extract.css}`);

            if (hashable.length === 0) {
                return null;
            }

            return hashable.join(":");
        },
        async generateBundle(outputOptions, bundle) {
            if (extracted.length === 0 || !(outputOptions.dir || outputOptions.file)) {
                return;
            }

            const bundleValues = Object.values(bundle);
            const directory = outputOptions.dir ?? dirname(outputOptions.file as string);
            const chunks = bundleValues.filter((chunk): chunk is OutputChunk => chunk.type === "chunk");
            const manual = chunks.filter((chunk) => !chunk.facadeModuleId);
            const emitted = outputOptions.preserveModules ? chunks : chunks.filter((chunk) => chunk.isEntry || chunk.isDynamicEntry);

            const emittedList: [string, string[]][] = [];

            const getExtractedData = async (name: string, ids: string[]): Promise<ExtractedData> => {
                const fileName =
                    typeof loaderOptions.extract === "string" ? normalize(loaderOptions.extract).replace(/^\.[/\\]/, "") : normalize(`${name}.css`);

                if (isAbsolute(fileName)) {
                    this.error(["Extraction path must be relative to the output directory,", `which is ${relative(cwd, directory)}`].join("\n"));
                }

                if (isRelative(fileName)) {
                    this.error(["Extraction path must be nested inside output directory,", `which is ${relative(cwd, directory)}`].join("\n"));
                }

                const entries = extracted.filter((extract) => ids.includes(extract.id)).sort((a, b) => ids.lastIndexOf(a.id) - ids.lastIndexOf(b.id));
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
                if (outputOptions.file) {
                    return parse(outputOptions.file).name;
                }

                if (outputOptions.preserveModules) {
                    const { dir, name } = parse(chunk.fileName);

                    return dir ? join(dir, name) : name;
                }

                return chunk.name;
            };

            const moved: string[] = [];

            if (typeof loaderOptions.extract === "string") {
                logger.debug({
                    message: `Extracting to ${loaderOptions.extract}`,
                    prefix: "css",
                });

                const ids: string[] = [];

                for (const chunk of manual) {
                    const chunkIds = traverseImportedModules(chunk.modules, this.getModuleInfo);

                    moved.push(...chunkIds);
                    ids.push(...chunkIds);
                }

                for (const chunk of emitted) {
                    ids.push(...traverseImportedModules(chunk.modules, this.getModuleInfo).filter((id) => !moved.includes(id)));
                }

                const name = getName(chunks[0] as OutputChunk);

                emittedList.push([name, ids]);
            } else {
                logger.debug({
                    message: "Extracting to individual files",
                    prefix: "css",
                });

                for (const chunk of manual) {
                    const ids = traverseImportedModules(chunk.modules, this.getModuleInfo);

                    if (ids.length === 0) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    moved.push(...ids);

                    const name = getName(chunk);

                    emittedList.push([name, ids]);
                }

                for (const chunk of emitted) {
                    const ids = traverseImportedModules(chunk.modules, this.getModuleInfo).filter((id) => !moved.includes(id));

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
                if (options.minifier) {
                    logger.info({
                        message: `Minifying ${extractedData.name} with ${options.minifier.name as string}`,
                        prefix: "css",
                    });

                    const { css: minifiedCss, map: minifiedMap } = await options.minifier.handler.bind({
                        browserTargets,
                        warn: this.warn.bind(this),
                    })(
                        extractedData,
                        sourceMap,
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,@typescript-eslint/no-explicit-any
                        (options[options.minifier.name as keyof StyleOptions] as Record<string, any>) ?? {},
                    );

                    extractedData.css = minifiedCss;
                    extractedData.map = minifiedMap;
                }

                const cssFile = {
                    fileName: extractedData.name,
                    name: extractedData.name, // @TODO: remove this later
                    names: [extractedData.name],
                    originalFileName: extractedData.name, // @TODO: remove this later
                    originalFileNames: [extractedData.name],
                    source: extractedData.css,
                    type: "asset" as const,
                };

                const cssFileId = this.emitFile(cssFile);

                if (extractedData.map && sourceMap) {
                    const fileName = this.getFileName(cssFileId);

                    const assetDirectory =
                        typeof outputOptions.assetFileNames === "string"
                            ? normalize(dirname(outputOptions.assetFileNames))
                            : typeof outputOptions.assetFileNames === "function"
                              ? normalize(dirname(outputOptions.assetFileNames(cssFile)))
                              : "assets";

                    const map = mm(extractedData.map)
                        .modify((m) => {
                            // eslint-disable-next-line no-param-reassign
                            m.file = basename(fileName);

                            return m;
                        })
                        .modifySources((source) => {
                            // Compensate for possible nesting depending on `assetFileNames` value
                            if (source === "<no source>") {
                                return source;
                            }

                            if (assetDirectory.length <= 1) {
                                return source;
                            }

                            // eslint-disable-next-line no-param-reassign
                            source = `../${source}`; // ...then there's definitely at least 1 level offset

                            for (const c of assetDirectory) {
                                if (c === "/") {
                                    // eslint-disable-next-line no-param-reassign
                                    source = `../${source}`;
                                }
                            }

                            return source;
                        });

                    if (sourceMap.inline) {
                        map.modify((m) => sourceMap.transform?.(m, normalize(join(directory, fileName))));

                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands,no-param-reassign,security/detect-object-injection
                        (bundle[fileName] as OutputAsset).source += map.toCommentData();
                    } else {
                        const mapFileName = `${fileName}.map`;

                        map.modify((m) => sourceMap.transform?.(m, normalize(join(directory, mapFileName))));

                        this.emitFile({ fileName: mapFileName, source: map.toString(), type: "asset" });

                        const { base } = parse(mapFileName);

                        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands,no-param-reassign,security/detect-object-injection
                        (bundle[fileName] as OutputAsset).source += map.toCommentFile(base);
                    }
                }
            }
        },
        name: "packem:css",
        async transform(code, transformId) {
            if (!isIncluded(transformId) || !loaders.isSupported(transformId)) {
                return null;
            }

            // Skip empty files
            if (code.replaceAll(/\s/g, "") === "") {
                return null;
            }

            // Check if file was already processed into JS
            // by other instance(s) of this or other plugin(s)
            try {
                this.parse(code, {}); // If it doesn't throw...
                this.warn(`Skipping processed file ${relative(cwd, transformId)}`);
                return null;
            } catch {
                // Was not already processed, continuing
            }

            if (typeof options.onImport === "function") {
                options.onImport(code, transformId);
            }

            const context: LoaderContext = {
                alias: mergedAlias,
                assets: new Map<string, Uint8Array>(),
                autoModules: loaderOptions.autoModules,
                browserTargets,
                cwd,
                debug,
                deps: new Set(),
                dts: loaderOptions.dts,
                emit: loaderOptions.emit,
                environment,
                extensions: loaderOptions.extensions,
                extract: loaderOptions.extract,
                id: transformId,
                inject: loaderOptions.inject,
                logger,
                namedExports: loaderOptions.namedExports,
                options: {},
                plugin: this,
                sourceDir: sourceDirectory,
                sourceMap,
                useSourcemap,
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

                extracted = extracted.filter((extract) => extract.id !== id);
                extracted.push(result.extracted);
            }

            return {
                code: result.code,
                map: sourceMap && result.map ? result.map : { mappings: "" as const },
                meta: {
                    styles: result.meta,
                },
                moduleSideEffects: result.extracted ? true : null,
            };
        },
    };
};
