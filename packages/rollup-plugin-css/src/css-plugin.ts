import { createFilter } from "@rollup/pluginutils";
import type { Environment } from "@visulima/packem-share/types";
import type { RollupLogger } from "@visulima/packem-share/utils";
import { createRollupLogger } from "@visulima/packem-share/utils";
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve } from "@visulima/path";
import { isRelative } from "@visulima/path/utils";
import type { GetModuleInfo, OutputChunk, Plugin } from "rollup";

import LoaderManager from "./loaders/loader-manager";
import type { Extracted, Loader, LoaderContext } from "./loaders/types";
import type { ExtractedData, InternalStyleOptions, StyleOptions } from "./types";
import concat from "./utils/concat";
import { ensurePCSSOption, ensurePCSSPlugins, inferHandlerOption, inferModeOption, inferOption, inferSourceMapOption } from "./utils/options";
import { mm } from "./utils/sourcemap";

const RELATIVE_PATH_RE = /^\.[/\\]/;
// Matches the first non-whitespace character; used to skip empty/whitespace-only CSS
// without allocating a stripped copy of the source.
const NON_WHITESPACE_RE = /\S/;

/**
 * Sorts loaders by their name order according to the specified processing sequence.
 *
 * This ensures loaders are executed in the correct order for proper CSS processing.
 * The typical order is: sourcemap → preprocessors → postcss.
 * @param objectsArray Array of loader objects to sort
 * @param nameOrder Desired order of loader names
 * @returns Promise resolving to sorted loader array
 */
const sortByNameOrder = (objectsArray: Loader[], nameOrder: string[]): Loader[] =>
    objectsArray.toSorted((a, b) => nameOrder.indexOf(a.name) - nameOrder.indexOf(b.name));

/**
 * Creates the main CSS processing plugin for Rollup.
 *
 * This plugin provides comprehensive CSS processing capabilities including:
 * - Multiple preprocessor support (Sass, Less, Stylus)
 * - PostCSS processing with plugin ecosystem
 * - CSS modules with automatic detection
 * - Source map generation and processing
 * - CSS injection or extraction modes
 * - Minification support
 * - TypeScript declaration generation
 * - Asset handling and optimization
 * @param options CSS processing options and loader configurations
 * @param browserTargets Target browsers for compatibility transformations
 * @param cwd Current working directory for resolving paths
 * @param sourceDirectory Source directory for relative path resolution
 * @param environment Build environment (development/production)
 * @param useSourcemap Whether to generate source maps
 * @param debug Enable debug logging and performance monitoring
 * @param minify Enable CSS minification
 * @param alias Path aliases for import resolution
 * @returns Promise resolving to configured Rollup plugin
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = await cssPlugin({
 *   mode: 'extract',
 *   extensions: ['.css', '.scss'],
 *   postcss: { plugins: [autoprefixer] }
 * }, ['> 1%'], process.cwd(), 'src', 'development', true, false, false, {});
 *
 * // CSS Modules with injection
 * const plugin = await cssPlugin({
 *   mode: 'inject',
 *   autoModules: true,
 *   namedExports: true
 * }, ['> 1%'], process.cwd(), 'src', 'production', false, false, true, {});
 * ```
 */
const cssPlugin = (
    options: StyleOptions,
    browserTargets: string[],
    cwd: string,
    sourceDirectory: string,
    environment: Environment,
    useSourcemap: boolean,
    debug: boolean,
    minify: boolean,
    alias: Record<string, string>,
): Plugin => {
    const mergedAlias = { ...alias, ...options.alias };
    const isIncluded = createFilter(options.include, options.exclude);

    const sourceMap = inferSourceMapOption(options.sourceMap);
    const loaderOptions: NonNullable<InternalStyleOptions> = {
        ...inferModeOption(options.mode),
        autoModules: options.autoModules ?? false,
        dts: options.dts,
        extensions: options.extensions as string[],
        namedExports: options.namedExports,
    };

    let logger: RollupLogger;
    let loaders: LoaderManager;

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
            modules: inferOption(options.postcss?.modules, undefined),
            to: options.postcss?.to,
            url: inferHandlerOption(options.postcss?.url, mergedAlias),
        };
    }

    // Keyed by extracted module id for O(1) upsert/dedupe in transform().
    // Insertion order is preserved by Map, matching previous push order; the
    // consumers below re-sort by the chunk's module id order anyway.
    const extracted = new Map<string, Extracted>();

    /**
     * Traverses imported modules to find all CSS dependencies in a chunk.
     *
     * This function recursively follows import chains to identify all CSS files
     * that should be included in a particular chunk for proper extraction and
     * chunk hash calculation.
     * @param chunkModules Modules included in the current chunk
     * @param getModuleInfo Rollup's module info getter function
     * @returns Array of CSS file IDs that belong to this chunk
     */
    // eslint-disable-next-line sonarjs/cognitive-complexity
    const traverseImportedModules = (chunkModules: Record<string, unknown>, getModuleInfo: GetModuleInfo): string[] => {
        const ids: string[] = [];

        for (const module of Object.keys(chunkModules)) {
            const traversed = new Set<string>();
            let current = [module];

            do {
                const imports: string[] = [];

                for (const id of current) {
                    if (traversed.has(id)) {
                        continue;
                    }

                    if (loaders.isSupported(id)) {
                        if (isIncluded(id)) {
                            imports.push(id);
                        }

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
        /**
         * Generates a hash for chunks that include CSS to ensure proper cache invalidation.
         *
         * This hook calculates a hash based on the CSS content and order to ensure
         * that chunks are properly invalidated when CSS changes.
         * @param chunk The chunk being processed
         * @returns Hash string for cache invalidation or undefined if no CSS
         */
        augmentChunkHash(chunk) {
            if (extracted.size === 0) {
                return undefined;
            }

            const ids = traverseImportedModules(chunk.modules, this.getModuleInfo);

            // Precompute id -> lastIndex once so membership and ordering are
            // O(1) lookups instead of ids.includes/lastIndexOf per entry.
            const lastIndex = new Map<string, number>();

            ids.forEach((id, index) => lastIndex.set(id, index));

            const hashable = [...extracted.values()]
                .filter((extract) => lastIndex.has(extract.id))
                .toSorted((a, b) => (lastIndex.get(a.id) as number) - (lastIndex.get(b.id) as number))
                .map((extract) => `${basename(extract.id)}:${extract.css}`);

            if (hashable.length === 0) {
                return undefined;
            }

            return hashable.join(":");
        },

        /**
         * Initializes the CSS plugin at the start of the build process.
         *
         * This hook:
         * - Creates the logger instance
         * - Initializes the loader manager with configured loaders
         * - Sets up loader processing order
         * - Validates configuration options
         * - Logs plugin initialization information
         */
        async buildStart() {
            // Reset extracted CSS on every build so deleted files don't leave phantom
            // entries that would be emitted in the next generateBundle call.
            extracted.clear();

            logger = createRollupLogger(this, "css");

            if (hasPostCssLoader && loaderOptions.postcss) {
                if (options.postcss?.parser) {
                    loaderOptions.postcss.parser = await ensurePCSSOption(options.postcss.parser, "parser", cwd, logger);
                }

                if (options.postcss?.syntax) {
                    loaderOptions.postcss.syntax = await ensurePCSSOption(options.postcss.syntax, "syntax", cwd, logger);
                }

                if (options.postcss?.stringifier) {
                    loaderOptions.postcss.stringifier = await ensurePCSSOption(options.postcss.stringifier, "stringifier", cwd, logger);
                }

                if (options.postcss?.plugins) {
                    loaderOptions.postcss.plugins = await ensurePCSSPlugins(options.postcss.plugins, cwd, logger);
                }
            }

            // Initialize loaders with logger
            loaders = new LoaderManager({
                extensions: loaderOptions.extensions,
                loaders: sortByNameOrder(options.loaders ?? [], ["sourcemap", "stylus", "less", "sass", "postcss"]),
                logger,
                options: {
                    ...options,
                    ...loaderOptions,
                    alias: mergedAlias,
                },
            });

            // Log plugin configuration
            logger.info({
                extract: typeof loaderOptions.extract === "string" ? loaderOptions.extract : "individual",
                loaders: options.loaders?.map((l) => l.name) ?? [],
                message: "CSS plugin initialized",
                minify: Boolean(minify && options.minifier),
                namedExports: Boolean(loaderOptions.namedExports),
                plugin: "css",
                sourceMap: useSourcemap,
            });

            // Check treeshakeable option
            if (typeof loaderOptions.inject === "object" && loaderOptions.inject.treeshakeable) {
                loaderOptions.namedExports = false;
                logger.info({
                    message: "Disabling named exports due to `inject.treeshakeable` option",
                    plugin: "css",
                });
            }
        },
        // eslint-disable-next-line sonarjs/cognitive-complexity
        async generateBundle(outputOptions, bundle) {
            if (extracted.size === 0 || !(outputOptions.dir || outputOptions.file)) {
                return;
            }

            const bundleValues = Object.values(bundle);
            const directory = outputOptions.dir ?? dirname(outputOptions.file as string);
            const chunks = bundleValues.filter((chunk): chunk is OutputChunk => chunk.type === "chunk");
            const manual = chunks.filter((chunk) => !chunk.facadeModuleId);
            const emitted = outputOptions.preserveModules ? chunks : chunks.filter((chunk) => chunk.isEntry || chunk.isDynamicEntry);

            const emittedList: [string, string[]][] = [];

            const getExtractedData = async (name: string, ids: string[]): Promise<ExtractedData> => {
                const fileName
                    = typeof loaderOptions.extract === "string" ? normalize(loaderOptions.extract).replace(RELATIVE_PATH_RE, "") : normalize(`${name}.css`);

                if (isAbsolute(fileName)) {
                    this.error(["Extraction path must be relative to the output directory,", `which is ${relative(cwd, directory)}`].join("\n"));
                }

                if (isRelative(fileName)) {
                    this.error(["Extraction path must be nested inside output directory,", `which is ${relative(cwd, directory)}`].join("\n"));
                }

                // Precompute id -> lastIndex once so membership and ordering are
                // O(1) lookups instead of ids.includes/lastIndexOf per entry.
                const lastIndex = new Map<string, number>();

                ids.forEach((id, index) => lastIndex.set(id, index));

                const entries = [...extracted.values()]
                    .filter((extract) => lastIndex.has(extract.id))
                    .toSorted((a, b) => (lastIndex.get(a.id) as number) - (lastIndex.get(b.id) as number));
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
                        continue;
                    }

                    moved.push(...ids);

                    const name = getName(chunk);

                    emittedList.push([name, ids]);
                }

                for (const chunk of emitted) {
                    const ids = traverseImportedModules(chunk.modules, this.getModuleInfo).filter((id) => !moved.includes(id));

                    if (ids.length === 0) {
                        continue;
                    }

                    const name = getName(chunk);

                    emittedList.push([name, ids]);
                }
            }

            // Sequential processing required: each iteration emits assets via this.emitFile() which
            // mutates Rollup's internal bundle state; concurrent emission would race.
            for (const [name, ids] of emittedList) {
                // eslint-disable-next-line no-await-in-loop
                const extractedData = await getExtractedData(name, ids);

                if (typeof options.onExtract === "function") {
                    const shouldExtract = options.onExtract(extractedData);

                    if (!shouldExtract) {
                        continue;
                    }
                }

                // Perform minimization on the extracted file
                if (minify && options.minifier) {
                    logger.info({
                        message: `Minifying ${extractedData.name} with ${options.minifier.name}`,
                        prefix: "css",
                    });

                    // eslint-disable-next-line no-await-in-loop
                    const { css: minifiedCss, map: minifiedMap } = await options.minifier.handler.bind({
                        browserTargets,
                        logger,
                    })(
                        extractedData,
                        sourceMap,
                        (options[options.minifier.name as keyof StyleOptions] as Record<string, unknown> | undefined) ?? {},
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

                // Pre-compute the sourcemap comment and append it to cssFile.source BEFORE emitFile.
                // Rollup's bundle param is mutated by emitFile in-place, but rolldown does not — so we
                // build the final source up front instead of mutating bundle[fileName] afterwards.
                if (extractedData.map && sourceMap) {
                    const fileName = extractedData.name;

                    let assetDirectory = "assert";

                    if (typeof outputOptions.assetFileNames === "string") {
                        assetDirectory = normalize(dirname(outputOptions.assetFileNames));
                    } else if (typeof outputOptions.assetFileNames === "function") {
                        assetDirectory = normalize(dirname(outputOptions.assetFileNames(cssFile)));
                    }

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

                        cssFile.source += map.toCommentData();

                        logger.debug({
                            message: `Generated inline source map for ${fileName}`,
                            plugin: "css",
                        });
                    } else {
                        const mapFileName = `${fileName}.map`;

                        map.modify((m) => sourceMap.transform?.(m, normalize(join(directory, mapFileName))));

                        this.emitFile({ fileName: mapFileName, source: map.toString(), type: "asset" });

                        const { base } = parse(mapFileName);

                        cssFile.source += map.toCommentFile(base);

                        logger.debug({
                            message: `Generated external source map: ${mapFileName}`,
                            plugin: "css",
                        });
                    }
                }

                this.emitFile(cssFile);

                logger.info({
                    chunkIds: ids.length,
                    hasSourceMap: Boolean(extractedData.map && sourceMap),
                    message: `Emitted CSS file: ${extractedData.name}`,
                    plugin: "css",
                    size: cssFile.source.length,
                });
            }

            // Log summary
            if (emittedList.length > 0) {
                logger.info({
                    filesEmitted: emittedList.length,
                    message: `CSS processing complete`,
                    plugin: "css",
                    totalExtracted: extracted.size,
                    totalSize: emittedList.reduce((sum, [, ids]) => sum + ids.length, 0),
                });
            }
        },
        name: "rollup-plugin-css",
        async transform(code, transformId) {
            if (!isIncluded(transformId) || !loaders.isSupported(transformId)) {
                return undefined;
            }

            // Skip empty files. Short-circuit on the first non-whitespace char
            // instead of allocating a whitespace-stripped copy of the source.
            if (!NON_WHITESPACE_RE.test(code)) {
                logger.debug({ message: `Skipping empty file: ${transformId}`, plugin: "css" });

                return undefined;
            }

            logger.info({ message: `Processing CSS file: ${transformId}`, plugin: "css", size: code.length });

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
                inline: loaderOptions.inline,
                logger,
                namedExports: loaderOptions.namedExports,
                options: {},
                plugin: this,
                sourceDir: sourceDirectory,
                sourceMap,
                useSourcemap,
            };

            const result = await loaders.process({ code }, context);

            // Log processing results
            logger.info({
                assets: context.assets.size,
                dependencies: context.deps.size,
                hasExtracted: Boolean(result.extracted),
                message: `Processed ${transformId}`,
                outputSize: result.code.length,
                plugin: "css",
            });

            for (const dep of context.deps) {
                this.addWatchFile(dep);
            }

            for (const [fileName, source] of context.assets) {
                this.emitFile({ fileName, source, type: "asset" });
                logger.debug({ message: `Emitted asset: ${fileName}`, plugin: "css", size: source.length });
            }

            if (result.extracted) {
                const { id } = result.extracted;

                // O(1) upsert: re-inserting an existing id keeps its content
                // updated while deduping re-transforms of the same module
                // (watch mode / re-eval).
                extracted.set(id, result.extracted);

                logger.debug({
                    cssSize: result.extracted.css.length,
                    hasSourceMap: Boolean(result.extracted.map),
                    message: `Extracted CSS from ${id}`,
                    plugin: "css",
                });
            }

            return {
                code: result.code,
                map: sourceMap && result.map ? result.map : { mappings: "" as const },
                meta: {
                    styles: result.meta,
                },
                moduleSideEffects: result.extracted ? true : undefined,
            };
        },
    };
};

export default cssPlugin;
