import { versions } from "node:process";

import { cyan } from "@visulima/colorize";
import type { AliasResolverObject } from "@visulima/packem-rollup";
import {
    alias as aliasPlugin,
    browserslistToEsbuild,
    cachingPlugin,
    chunkSplitter,
    commonjs as commonjsPlugin,
    createSplitChunks,
    dynamicImportVars as dynamicImportVariablesPlugin,
    fixDynamicImportExtension,
    metafilePlugin,
    nodeResolve as nodeResolvePlugin,
    polyfillNode as polyfillPlugin,
    purePlugin,
    replace as replacePlugin,
    resolveFileUrlPlugin,
    visualizer as visualizerPlugin,
    wasm as wasmPlugin,
} from "@visulima/packem-rollup";
import { babelTransformPlugin } from "@visulima/packem-rollup/babel";
import type { EsbuildPluginConfig } from "@visulima/packem-rollup/esbuild";
import type { InternalOXCTransformPluginConfig } from "@visulima/packem-rollup/oxc";
import { oxcResolvePlugin } from "@visulima/packem-rollup/oxc";
import { cjsInteropPlugin } from "@visulima/packem-rollup/plugin/cjs-interop";
import { copyPlugin } from "@visulima/packem-rollup/plugin/copy";
import { dataUriPlugin } from "@visulima/packem-rollup/plugin/data-uri";
import { debarrelPlugin } from "@visulima/packem-rollup/plugin/debarrel";
import { esmShimCjsSyntaxPlugin } from "@visulima/packem-rollup/plugin/esm-shim-cjs-syntax";
import { fixDtsDefaultCjsExportsPlugin } from "@visulima/packem-rollup/plugin/fix-dts-default-cjs-exports";
import { isolatedDeclarationsPlugin } from "@visulima/packem-rollup/plugin/isolated-declarations";
import { JsonPlugin } from "@visulima/packem-rollup/plugin/json";
import { jsxRemoveAttributes } from "@visulima/packem-rollup/plugin/jsx-remove-attributes";
import { licensePlugin } from "@visulima/packem-rollup/plugin/license";
import { minifyHTMLLiteralsPlugin } from "@visulima/packem-rollup/plugin/minify-html-literals";
import { nativeModulesPlugin } from "@visulima/packem-rollup/plugin/native-modules";
import { preserveDirectivesPlugin } from "@visulima/packem-rollup/plugin/preserve-directives";
import { rawPlugin } from "@visulima/packem-rollup/plugin/raw";
import { requireCJSTransformerPlugin } from "@visulima/packem-rollup/plugin/require-cjs-transformer";
import type { ShebangOptions } from "@visulima/packem-rollup/plugin/shebang";
import { removeShebangPlugin, shebangPlugin } from "@visulima/packem-rollup/plugin/shebang";
import { sourcemapsPlugin } from "@visulima/packem-rollup/plugin/source-maps";
import { urlPlugin } from "@visulima/packem-rollup/plugin/url";
import type { SucrasePluginConfig } from "@visulima/packem-rollup/sucrase";
import type { SwcPluginConfig } from "@visulima/packem-rollup/swc";
import {
    patchTypescriptTypesPlugin,
    resolveTsconfigPathsPlugin,
    resolveTsconfigRootDirectoriesPlugin,
    resolveTypescriptMjsCtsPlugin,
} from "@visulima/packem-rollup/typescript";
import type { BuildContext, FileCache } from "@visulima/packem-share";
import { arrayify, memoizeByKey } from "@visulima/packem-share";
import { getChunkFilename, getDtsExtension, getEntryFileNames, getOutputExtension, sortUserPlugins } from "@visulima/packem-share/utils";
import { join, relative, resolve } from "@visulima/path";
import { cssModulesTypesPlugin, rollupCssPlugin } from "@visulima/rollup-plugin-css";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { OutputOptions, Plugin, PreRenderedAsset, PreRenderedChunk, RollupLog, RollupOptions } from "rollup";
import { minVersion } from "semver";

import type { InternalBuildOptions } from "../types";
import { resolveExternalsPlugin } from "./plugins/resolve-externals-plugin";
import resolveAliases from "./utils/resolve-aliases";

/**
 * Checks if a chunk/entry name indicates a declaration-only file that should not generate JavaScript.
 * @param name Chunk or entry name to check
 * @returns True if the name ends with .d (indicating declaration-only)
 */
const isDeclarationOnlyName = (name: string | undefined): boolean => Boolean(name?.endsWith(".d"));

/**
 * Creates a chunkFileNames function that skips declaration-only entries.
 * @param getExtension Function to get the output extension
 * @param usePreserveModules Whether preserveModules mode is enabled
 * @returns chunkFileNames function for Rollup
 */
const createChunkFileNames = (getExtension: () => string, usePreserveModules: boolean) => {
    if (usePreserveModules) {
        return (chunk: PreRenderedChunk): string | undefined => {
            if (isDeclarationOnlyName(chunk.name)) {
                return undefined;
            }

            return `${chunk.name}.${getExtension()}`;
        };
    }

    return (chunk: PreRenderedChunk): string | undefined => {
        if (isDeclarationOnlyName(chunk.name)) {
            return undefined;
        }

        return getChunkFilename(chunk, getExtension());
    };
};

/**
 * Creates an entryFileNames function that skips declaration-only entries.
 * @param getExtension Function to get the output extension
 * @param usePreserveModules Whether preserveModules mode is enabled
 * @returns entryFileNames function for Rollup
 */
const createEntryFileNames = (getExtension: () => string, usePreserveModules: boolean) => {
    if (usePreserveModules) {
        return (chunkInfo: PreRenderedAsset): string | undefined => {
            const name = Array.isArray(chunkInfo.names) && chunkInfo.names[0] ? chunkInfo.names[0] : chunkInfo.name;

            if (isDeclarationOnlyName(name)) {
                return undefined;
            }

            return `${name ?? "[name]"}.${getExtension()}`;
        };
    }

    return (chunkInfo: PreRenderedAsset): string | undefined => {
        const name = Array.isArray(chunkInfo.names) && chunkInfo.names[0] ? chunkInfo.names[0] : chunkInfo.name;

        if (isDeclarationOnlyName(name)) {
            return undefined;
        }

        return getEntryFileNames(chunkInfo, getExtension());
    };
};

const getTransformerConfig = (
    name: InternalBuildOptions["transformerName"],
    context: BuildContext<InternalBuildOptions>,
): EsbuildPluginConfig | InternalOXCTransformPluginConfig | SucrasePluginConfig | SwcPluginConfig => {
    let nodeTarget = `node${versions.node.split(".")[0]}`;

    if (context.pkg.engines?.node) {
        const minNodeVersion = minVersion(context.pkg.engines.node);

        if (minNodeVersion) {
            nodeTarget = `node${minNodeVersion.major}`;
        }
    }

    if (name === "esbuild") {
        if (!context.options.rollup.esbuild) {
            throw new Error("No esbuild options found in your configuration.");
        }

        if (context.tsconfig?.config.compilerOptions?.target?.toLowerCase() === "es3") {
            context.logger.warn(
                [
                    "ES3 target is not supported by esbuild, so ES5 will be used instead..",
                    "Please set 'target' option in tsconfig to at least ES5 to disable this error",
                ].join(" "),
            );

            context.tsconfig.config.compilerOptions.target = "es5";
            context.options.rollup.esbuild.target = "es5";
        }

        // Add targets to esbuild target
        if (context.options.rollup.esbuild.target) {
            const targets = arrayify(context.options.rollup.esbuild.target);

            if (context.options.runtime === "node") {
                context.options.rollup.esbuild.target = [...new Set([nodeTarget, ...targets])];
            } else if (context.options.runtime === "browser") {
                context.options.rollup.esbuild.target = [...new Set([...browserslistToEsbuild(context.options.browserTargets ?? []), ...targets])];
            }
        } else {
            context.options.rollup.esbuild.target
                = context.options.runtime === "node" ? [nodeTarget] : browserslistToEsbuild(context.options.browserTargets ?? []);
        }

        // keepNames is not needed when minify is disabled.
        // Also transforming multiple times with keepNames enabled breaks tree-shaking.
        if (!context.options.minify) {
            context.options.rollup.esbuild.keepNames = false;

            context.logger.debug("Disabling keepNames because minify is disabled");
        }

        if (context.tsconfig?.config.compilerOptions?.target === "es5") {
            context.options.rollup.esbuild.keepNames = false;

            context.logger.debug("Disabling keepNames because target is set to es5");
        }

        return {
            logger: context.logger,
            minify: context.options.minify,

            /**
             * Smaller output for cache and marginal performance improvement:
             * https://twitter.com/evanwallace/status/1396336348366180359?s=20
             *
             * minifyIdentifiers is disabled because debuggers don't use the
             * `names` property from the source map
             *
             * minifySyntax is disabled because it does some tree-shaking
             * eg. unused try-catch error variable
             */
            minifyWhitespace: context.options.minify,
            sourceMap: context.options.sourcemap,
            ...context.options.rollup.esbuild,
        } satisfies EsbuildPluginConfig;
    }

    if (name === "swc") {
        if (!context.options.rollup.swc) {
            throw new Error("No swc options found in your configuration.");
        }

        return {
            minify: context.options.minify,
            ...context.options.rollup.swc,
            jsc: {
                minify: {
                    compress: {
                        directives: false,
                        passes: 2,
                    },
                    format: {
                        comments: "some",
                    },
                    mangle: {
                        topLevel: true,
                    },
                    sourceMap: context.options.sourcemap,
                    toplevel: context.options.emitCJS ?? context.options.emitESM,
                },
                ...context.options.rollup.swc.jsc,
            },
            sourceMaps: context.options.sourcemap,
        } satisfies SwcPluginConfig;
    }

    if (name === "sucrase") {
        if (!context.options.rollup.sucrase) {
            throw new Error("No sucrase options found in your configuration.");
        }

        return context.options.rollup.sucrase satisfies SucrasePluginConfig;
    }

    if (name === "oxc") {
        if (!context.options.rollup.oxc) {
            throw new Error("No oxc options found in your configuration.");
        }

        context.options.rollup.oxc = {
            ...context.options.rollup.oxc,
            cwd: context.options.rootDir,
            jsx:
                typeof context.options.rollup.oxc.jsx === "string"
                    ? context.options.rollup.oxc.jsx
                    : context.options.rollup.oxc.jsx
                        ? {
                            ...context.options.rollup.oxc.jsx,
                            // This is not needed in a library.
                            refresh: false,
                        }
                        : undefined,
            sourcemap: context.options.sourcemap,
            typescript: context.tsconfig?.config
                ? {
                    allowDeclareFields: true,
                    allowNamespaces: true,
                    declaration: undefined,
                    jsxPragma: context.tsconfig.config.compilerOptions?.jsxFactory,
                    jsxPragmaFrag: context.tsconfig.config.compilerOptions?.jsxFragmentFactory,
                    onlyRemoveTypeImports: true,
                    // Our declaration is handled by the isolated declaration transformer
                    rewriteImportExtensions: false,
                }
                : undefined,
        } satisfies InternalOXCTransformPluginConfig;

        // Add targets to oxc target
        if (context.options.rollup.oxc.target) {
            const targets = arrayify(context.options.rollup.oxc.target);

            if (context.options.runtime === "node") {
                context.options.rollup.oxc.target = [...new Set([nodeTarget, ...targets])];
            } else if (context.options.runtime === "browser") {
                context.options.rollup.oxc.target = [...new Set([...browserslistToEsbuild(context.options.browserTargets ?? []), ...targets])];
            }
        } else {
            context.options.rollup.oxc.target = context.options.runtime === "node" ? [nodeTarget] : browserslistToEsbuild(context.options.browserTargets ?? []);
        }

        return context.options.rollup.oxc satisfies InternalOXCTransformPluginConfig;
    }

    throw new Error(`A Unknown transformer was provided`);
};

const sharedOnWarn = (warning: RollupLog, context: BuildContext<InternalBuildOptions>): boolean => {
    // If the circular dependency warning is from node_modules, ignore it
    if (warning.code === "CIRCULAR_DEPENDENCY" && /Circular dependency:[\s\S]*node_modules/.test(warning.message)) {
        return true;
    }

    // eslint-disable-next-line no-secrets/no-secrets
    // @see https:// github.com/rollup/rollup/blob/5abe71bd5bae3423b4e2ee80207c871efde20253/cli/run/batchWarnings.ts#L236
    if (warning.code === "UNRESOLVED_IMPORT") {
        throw new Error(
            `Failed to resolve the module "${warning.exporter as string}" imported by "${cyan(relative(resolve(), warning.id as string))}"`
            + `\nIs the module installed? Note:`
            + `\n ↳ to inline a module into your bundle, install it to "devDependencies".`
            + `\n ↳ to depend on a module via import/require, install it to "dependencies".`,
        );
    }

    if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
        return true;
    }

    return warning.code === "MIXED_EXPORTS" && context.options.cjsInterop === true;
};

const baseRollupOptions = (context: BuildContext<InternalBuildOptions>, type: "build" | "dts"): RollupOptions =>
    <RollupOptions>{
        input: Object.fromEntries(context.options.entries.map((entry) => [entry.name, resolve(context.options.rootDir, entry.input)])),

        logLevel: context.options.debug ? "debug" : "info",

        onLog: (level, log) => {
            let format = log.message;

            if (log.stack) {
                format = `${format}\n${log.stack}`;
            }

            // Handle unresolved import warnings from node-resolve plugin
            if (level === "warn" && log.plugin === "node-resolve" && format.includes("Could not resolve import")) {
                const unresolvedImportBehavior
                    = context.options.rollup.resolve && typeof context.options.rollup.resolve === "object"
                        ? context.options.rollup.resolve.unresolvedImportBehavior ?? "error"
                        : "error";

                if (unresolvedImportBehavior === "error") {
                    throw new Error(format);
                }
                // If "warn", fall through to the warn case below
            }

            // eslint-disable-next-line default-case
            switch (level) {
                case "info": {
                    context.logger.info({
                        message: format,
                        prefix: type + (log.plugin ? `:plugin:${log.plugin}` : ""),
                    });

                    return;
                }
                case "warn": {
                    context.logger.warn({
                        message: format,
                        prefix: type + (log.plugin ? `:plugin:${log.plugin}` : ""),
                    });

                    return;
                }
                case "debug": {
                    context.logger.debug({
                        message: format,
                        prefix: type + (log.plugin ? `:plugin:${log.plugin}` : ""),
                    });
                }
            }
        },

        onwarn(warning: RollupLog, rollupWarn) {
            if (sharedOnWarn(warning, context)) {
                return;
            }

            if (!warning.code) {
                rollupWarn(warning);
            }
        },

        preserveEntrySignatures: "strict",

        treeshake: {
            // preserve side-effect-only imports:
            moduleSideEffects: true,
            // use Rollup's most optimal tree-shaking: (drops unused getter reads)
            preset: "smallest",
        },

        watch: context.mode === "watch" ? context.options.rollup.watch : false,
    };

// eslint-disable-next-line import/exports-last
export const getRollupOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context.pkg, context.options);

    let nodeResolver;

    if (context.options.rollup.resolve && context.options.experimental?.oxcResolve !== true) {
        nodeResolver = nodeResolvePlugin({
            ...context.options.rollup.resolve,
        });
    } else if (context.options.experimental?.oxcResolve && context.options.rollup.experimental?.resolve) {
        nodeResolver = oxcResolvePlugin(context.options.rollup.experimental.resolve, context.options.rootDir, context.logger, context.tsconfig?.path);
    }

    const chunking
        = context.options.unbundle || context.options.rollup.output?.preserveModules
            ? {
                preserveModules: true,
                preserveModulesRoot: context.options.rollup.output?.preserveModulesRoot ?? context.options.sourceDir,
            }
            : {
                manualChunks: createSplitChunks(context.dependencyGraphMap, context.buildEntries),
                preserveModules: false,
            };

    const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(context.options.rollup.plugins, "build");

    // Add esm mark and interop helper if esm export is detected
    const useEsModuleMark = context.tsconfig?.config.compilerOptions?.esModuleInterop;

    let purePluginInstance: Plugin | undefined;

    if (context.options.rollup.pure) {
        purePluginInstance = purePlugin({
            ...context.options.rollup.pure,
            functions: [
                // Common utility functions
                "Object.defineProperty",
                "Object.assign",
                "Object.create",
                "Object.freeze",
                "Object.seal",
                "Object.setPrototypeOf",
                "Object.getOwnPropertyDescriptor",
                "Object.getOwnPropertyDescriptors",
                "Object.getPrototypeOf",
                "Object.hasOwnProperty",
                "Object.isExtensible",
                "Object.isFrozen",
                "Object.isSealed",

                // Symbol functions - commonly used in libraries but safe to tree-shake when unused
                "Symbol",
                "Symbol.for",
                "Symbol.keyFor",
                "Symbol.iterator",
                "Symbol.asyncIterator",
                "Symbol.hasInstance",
                "Symbol.isConcatSpreadable",
                "Symbol.species",
                "Symbol.toPrimitive",
                "Symbol.toStringTag",

                // Proxy constructor - safe when unused
                "Proxy",

                // Reflect methods - typically pure
                "Reflect.apply",
                "Reflect.construct",
                "Reflect.defineProperty",
                "Reflect.deleteProperty",
                "Reflect.get",
                "Reflect.getOwnPropertyDescriptor",
                "Reflect.getPrototypeOf",
                "Reflect.has",
                "Reflect.isExtensible",
                "Reflect.ownKeys",
                "Reflect.preventExtensions",
                "Reflect.set",
                "Reflect.setPrototypeOf",

                // WeakMap/WeakSet constructors - safe when unused
                "WeakMap",
                "WeakSet",
                "WeakRef",

                // Array methods that don't mutate
                "Array.from",
                "Array.of",
                "Array.isArray",

                // Number methods
                "Number.isFinite",
                "Number.isInteger",
                "Number.isNaN",
                "Number.isSafeInteger",
                "Number.parseFloat",
                "Number.parseInt",

                // String methods
                "String.fromCharCode",
                "String.fromCodePoint",
                "String.raw",

                // Date constructor when used for static methods
                "Date.now",
                "Date.parse",
                "Date.UTC",

                // Math methods (all are pure)
                "Math.abs",
                "Math.acos",
                "Math.acosh",
                "Math.asin",
                "Math.asinh",
                "Math.atan",
                "Math.atan2",
                "Math.atanh",
                "Math.cbrt",
                "Math.ceil",
                "Math.clz32",
                "Math.cos",
                "Math.cosh",
                "Math.exp",
                "Math.expm1",
                "Math.floor",
                "Math.fround",
                "Math.hypot",
                "Math.imul",
                "Math.log",
                "Math.log10",
                "Math.log1p",
                "Math.log2",
                "Math.max",
                "Math.min",
                "Math.pow",
                "Math.random",
                "Math.round",
                "Math.sign",
                "Math.sin",
                "Math.sinh",
                "Math.sqrt",
                "Math.tan",
                "Math.tanh",
                "Math.trunc",

                // JSON methods
                "JSON.parse",
                "JSON.stringify",

                // Common library patterns
                "require.resolve",
                "Buffer.from",
                "Buffer.alloc",
                "Buffer.allocUnsafe",
                "Buffer.isBuffer",
                ...context.options.rollup.pure?.functions ?? [],
            ],
            sourcemap: context.options.sourcemap,
        });

        // @ts-expect-error Hacking into the plugin ignoring types, we just fixed the order
        purePluginInstance.transform.order = "pre";
    }

    return (<RollupOptions>{
        ...baseRollupOptions(context, "build"),

        output: [
            context.options.emitCJS
            && <OutputOptions>{
                // Governs names of CSS files (for assets from CSS use `hash` option for url handler).
                // Note: using value below will put `.css` files near js,
                // but make sure to adjust `hash`, `assetDir` and `publicPath`
                // options for url handler accordingly.
                assetFileNames: "[name]-[hash][extname]",
                chunkFileNames: createChunkFileNames(
                    () => getOutputExtension(context, "cjs"),
                    context.options.unbundle || context.options.rollup.output?.preserveModules === true,
                ),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: createEntryFileNames(
                    () => getOutputExtension(context, "cjs"),
                    context.options.unbundle || context.options.rollup.output?.preserveModules === true,
                ),
                esModule: useEsModuleMark ?? "if-default-prop",
                exports: "auto",
                extend: true,
                // turn off live bindings support (exports.* getters for re-exports)
                externalLiveBindings: false,
                format: "cjs",
                freeze: false,
                generatedCode: {
                    arrowFunctions: true,
                    constBindings: true,
                    objectShorthand: true,
                    preset: context.tsconfig?.config.compilerOptions?.target === "es5" ? "es5" : "es2015",
                    reservedNamesAsProps: true,
                    symbols: true,
                },
                // will be added as empty imports to the entry chunks. Disable to avoid imports hoist outside of boundaries
                hoistTransitiveImports: false,
                // By default, in rollup, when creating multiple chunks, transitive imports of entry chunks
                interop: "compat",
                sourcemap: context.options.sourcemap,
                validate: true,
                ...context.options.rollup.output,
                ...chunking,
            },
            context.options.emitESM
            && <OutputOptions>{
                // Governs names of CSS files (for assets from CSS use `hash` option for url handler).
                // Note: using value below will put `.css` files near js,
                // but make sure to adjust `hash`, `assetDir` and `publicPath`
                // options for url handler accordingly.
                assetFileNames: "[name]-[hash][extname]",
                chunkFileNames: createChunkFileNames(
                    () => getOutputExtension(context, "esm"),
                    context.options.unbundle || context.options.rollup.output?.preserveModules === true,
                ),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: createEntryFileNames(
                    () => getOutputExtension(context, "esm"),
                    context.options.unbundle || context.options.rollup.output?.preserveModules === true,
                ),
                esModule: useEsModuleMark ?? "if-default-prop",
                exports: "auto",
                extend: true,
                // turn off live bindings support (exports.* getters for re-exports)
                externalLiveBindings: false,
                format: "esm",
                freeze: false,
                generatedCode: {
                    arrowFunctions: true,
                    constBindings: true,
                    objectShorthand: true,
                    preset: context.tsconfig?.config.compilerOptions?.target === "es5" ? "es5" : "es2015",
                    reservedNamesAsProps: true,
                    symbols: true,
                },
                // By default, in rollup, when creating multiple chunks, transitive imports of entry chunks
                // will be added as empty imports to the entry chunks. Disable to avoid imports hoist outside of boundaries
                hoistTransitiveImports: false,
                sourcemap: context.options.sourcemap,
                validate: true,
                ...context.options.rollup.output,
                ...chunking,
            },
        ].filter(Boolean),

        plugins: [
            cachingPlugin(resolveFileUrlPlugin(), fileCache),

            context.tsconfig && cachingPlugin(resolveTsconfigRootDirectoriesPlugin(context.options.rootDir, context.logger, context.tsconfig), fileCache),
            context.tsconfig
            && context.options.rollup.tsconfigPaths
            && cachingPlugin(
                resolveTsconfigPathsPlugin(context.options.rootDir, context.tsconfig, context.logger, context.options.rollup.tsconfigPaths),
                fileCache,
            ),

            resolveExternalsPlugin(context),

            context.options.rollup.replace
            && (() => {
                const replaceConfig = {
                    sourcemap: context.options.sourcemap,
                    ...context.options.rollup.replace,
                    values: context.options.rollup.replace.values ? { ...context.options.rollup.replace.values } : {},
                };

                return replacePlugin(replaceConfig);
            })(),

            context.options.rollup.alias
            && aliasPlugin({
                // https://github.com/rollup/plugins/tree/master/packages/alias#custom-resolvers
                customResolver: nodeResolver as AliasResolverObject,
                ...context.options.rollup.alias,
                entries: resolvedAliases,
            }),

            ...prePlugins,

            nodeResolver,

            context.options.rollup.nativeModules && nativeModulesPlugin(context.options.rollup.nativeModules),

            context.options.rollup.dataUri
            && dataUriPlugin({
                ...context.options.rollup.dataUri,
            }),

            context.options.rollup.polyfillNode
            && polyfillPlugin({
                sourceMap: context.options.sourcemap,
                ...context.options.rollup.polyfillNode,
            }),

            context.options.rollup.json
            && JsonPlugin({
                ...context.options.rollup.json,
            }),

            context.options.rollup.debarrel && debarrelPlugin(context.options.rollup.debarrel, context.logger),

            chunkSplitter(),

            context.options.rollup.wasm && wasmPlugin(context.options.rollup.wasm),

            context.options.rollup.url && urlPlugin(context.options.rollup.url),

            context.options.rollup.css
            && context.options.rollup.css.loaders
            && context.options.rollup.css.loaders.length > 0
            && cachingPlugin(
                await rollupCssPlugin(
                    {
                        dts: Boolean(context.options.declaration) || context.options.isolatedDeclarationTransformer !== undefined,
                        sourceMap: context.options.sourcemap,
                        ...context.options.rollup.css,
                    },
                    context.options.browserTargets as string[],
                    context.options.rootDir,
                    context.options.sourceDir,
                    context.environment,
                    context.options.sourcemap,
                    context.options.debug,
                    context.options.minify ?? false,
                    resolvedAliases,
                ),
                fileCache,
            ),

            context.options.rollup.css
            && context.options.rollup.css.loaders
            && context.options.rollup.css.loaders.length > 0
            && context.options.declaration
            && cssModulesTypesPlugin(context.options.rollup.css, context.options.rootDir),

            context.options.rollup.raw && cachingPlugin(rawPlugin(context.options.rollup.raw), fileCache),

            context.options.sourcemap && sourcemapsPlugin(context.options.rollup.sourcemap),

            ...normalPlugins,

            context.options.rollup.minifyHTMLLiterals
            && context.options.minify
            && minifyHTMLLiteralsPlugin({
                ...context.options.rollup.minifyHTMLLiterals,
                logger: context.logger,
            }),

            context.options.declaration
            && context.options.rollup.isolatedDeclarations
            && context.options.isolatedDeclarationTransformer
            && cachingPlugin(isolatedDeclarationsPlugin<InternalBuildOptions>(join(context.options.rootDir, context.options.sourceDir), context), fileCache),

            context.options.rollup.requireCJS
            && context.options.emitESM
            && cachingPlugin(
                requireCJSTransformerPlugin(
                    {
                        ...context.options.rollup.requireCJS,
                        cwd: context.options.rootDir,
                    },
                    context.logger,
                ),
                fileCache,
            ),

            context.options.rollup.babel
            && cachingPlugin(
                babelTransformPlugin({
                    // eslint-disable-next-line sonarjs/single-character-alternation
                    include: context.options.rollup.babel.include ?? /\.(?:m|c)?(?:j|t)sx?$/,
                    ...context.options.rollup.babel,
                    root: context.options.rootDir,
                    sourceMaps: context.options.rollup.babel.sourceMaps ?? context.options.sourcemap ?? false,
                }),
                fileCache,
            ),

            purePluginInstance,

            cachingPlugin(context.options.transformer(getTransformerConfig(context.options.transformerName, context)), fileCache),

            context.options.rollup.preserveDirectives
            && preserveDirectivesPlugin({
                directiveRegex: /^['|"](use (\w+))['|"]$/,
                ...context.options.rollup.preserveDirectives,
                logger: context.logger,
            }),

            context.options.rollup.shebang
            && shebangPlugin(
                context.options.entries
                    .filter((entry) => entry.executable)
                    .map((entry) => entry.name)
                    .filter(Boolean) as string[],
                context.options.rollup.shebang as ShebangOptions,
            ),

            context.options.cjsInterop
            && context.options.emitCJS
            && cjsInteropPlugin({
                ...context.options.rollup.cjsInterop,
                logger: context.logger,
            }),

            context.options.rollup.dynamicVars && fixDynamicImportExtension(),
            context.options.rollup.dynamicVars && dynamicImportVariablesPlugin(context.options.rollup.dynamicVars),

            context.options.rollup.commonjs
            && cachingPlugin(
                commonjsPlugin({
                    sourceMap: context.options.sourcemap,
                    ...context.options.rollup.commonjs,
                }),
                fileCache,
            ),

            context.options.rollup.preserveDynamicImports
            && ({
                name: "packem:preserve-dynamic-imports",
                renderDynamicImport() {
                    return { left: "import(", right: ")" };
                },
            } as Plugin),

            context.options.cjsInterop && context.options.rollup.shim && esmShimCjsSyntaxPlugin(context.pkg, context.options.rollup.shim),

            context.options.rollup.jsxRemoveAttributes
            && cachingPlugin(
                jsxRemoveAttributes({
                    attributes: context.options.rollup.jsxRemoveAttributes.attributes,
                    logger: context.logger,
                }),
                fileCache,
            ),

            ...postPlugins,

            context.options.rollup.metafile && metafilePlugin(),

            context.options.rollup.copy && copyPlugin(context.options.rollup.copy, context.logger),

            context.options.rollup.license
            && context.options.rollup.license.path
            && typeof context.options.rollup.license.dependenciesTemplate === "function"
            && licensePlugin({
                dtsMarker: context.options.rollup.license.dtsMarker ?? "TYPE_DEPENDENCIES",
                licenseFilePath: context.options.rollup.license.path,
                licenseTemplate: context.options.rollup.license.dependenciesTemplate,
                logger: context.logger,
                marker: context.options.rollup.license.dependenciesMarker ?? "DEPENDENCIES",
                mode: "dependencies",
                packageName: context.pkg.name,
            }),

            context.options.analyze
            && context.options.rollup.visualizer !== false
            && visualizerPlugin({
                brotliSize: true,
                gzipSize: true,
                projectRoot: context.options.rootDir,
                sourcemap: context.options.sourcemap,
                ...context.options.rollup.visualizer,
                filename: "packem-bundle-analyze.html",
                title: "Packem Visualizer",
            }),
        ].filter(Boolean),

        preserveEntrySignatures: "strict",
    }) as RollupOptions;
};

const createDtsPlugin = async (context: BuildContext<InternalBuildOptions>): Promise<Plugin> => {
    const { dts } = require("rollup-plugin-dts") as typeof import("rollup-plugin-dts");

    return dts({
        compilerOptions: {
            ...context.options.rollup.dts.compilerOptions,
            incremental: undefined,
            inlineSources: undefined,
            sourceMap: undefined,
            tsBuildInfoFile: undefined,
        },
        respectExternal: context.options.rollup.dts.respectExternal,
        tsconfig: context.tsconfig?.path,
    });
};

// Avoid create multiple dts plugins instance and parsing the same tsconfig multi times,
// This will avoid memory leak and performance issue.
const memoizeDtsPluginByKey = memoizeByKey<typeof createDtsPlugin>(createDtsPlugin);

export const getRollupDtsOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context.pkg, context.options);
    const compilerOptions = context.tsconfig?.config.compilerOptions;

    delete compilerOptions?.lib;

    let nodeResolver;

    if (context.options.rollup.resolve && context.options.experimental?.oxcResolve !== true) {
        nodeResolver = nodeResolvePlugin({
            ...context.options.rollup.resolve,
        });
    } else if (context.options.experimental?.oxcResolve && context.options.rollup.experimental?.resolve) {
        nodeResolver = oxcResolvePlugin(context.options.rollup.experimental.resolve, context.options.rootDir, context.logger, context.tsconfig?.path);
    }

    // Each process should be unique
    // Each package build should be unique
    // Composing above factors into a unique cache key to retrieve the memoized dts plugin with tsconfigs

    const uniqueProcessId = `dts-plugin:${process.pid}${(context.tsconfig as TsConfigResult).path}` as string;

    const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(context.options.rollup.plugins, "dts");

    return <RollupOptions>{
        ...baseRollupOptions(context, "dts"),

        onwarn(warning, rollupWarn) {
            if (sharedOnWarn(warning, context)) {
                return;
            }

            if (warning.code === "EMPTY_BUNDLE") {
                return;
            }

            rollupWarn(warning);
        },

        output: [
            context.options.emitCJS
            && <OutputOptions>{
                chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, getDtsExtension(context, "cjs")),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: `[name].${getDtsExtension(context, "cjs")}`,
                format: "cjs",
                sourcemap: context.options.sourcemap,
                ...context.options.rollup.output,
            },
            context.options.emitESM
            && <OutputOptions>{
                chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, getDtsExtension(context, "esm")),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: `[name].${getDtsExtension(context, "esm")}`,
                format: "esm",
                sourcemap: context.options.sourcemap,
                ...context.options.rollup.output,
            },
            // .d.ts for node10 compatibility (TypeScript version < 4.7)
            context.options.declaration === "compatible"
            && <OutputOptions>{
                chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, "d.ts"),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: "[name].d.ts",
                format: "cjs",
                sourcemap: context.options.sourcemap,
                ...context.options.rollup.output,
            },
        ].filter(Boolean),

        plugins: [
            cachingPlugin(resolveFileUrlPlugin(), fileCache),
            cachingPlugin(resolveTypescriptMjsCtsPlugin(), fileCache),

            context.options.rollup.json
            && JsonPlugin({
                ...context.options.rollup.json,
            }),

            <Plugin>{
                load(id) {
                    if (!/\.(?:js|cjs|mjs|jsx|ts|tsx|ctsx|mtsx|mts|json)$/.test(id)) {
                        return "";
                    }

                    return undefined;
                },
                name: "packem:ignore-files",
            },

            context.tsconfig && cachingPlugin(resolveTsconfigRootDirectoriesPlugin(context.options.rootDir, context.logger, context.tsconfig), fileCache),
            context.tsconfig
            && context.options.rollup.tsconfigPaths
            && cachingPlugin(
                resolveTsconfigPathsPlugin(context.options.rootDir, context.tsconfig, context.logger, context.options.rollup.tsconfigPaths),
                fileCache,
            ),

            resolveExternalsPlugin(context),

            context.options.rollup.replace
            && (() => {
                const replaceConfig = {
                    sourcemap: context.options.sourcemap,
                    ...context.options.rollup.replace,
                    values: context.options.rollup.replace.values ? { ...context.options.rollup.replace.values } : {},
                };

                return replacePlugin(replaceConfig);
            })(),

            context.options.rollup.alias
            && aliasPlugin({
                // https://github.com/rollup/plugins/tree/master/packages/alias#custom-resolvers
                customResolver: nodeResolver as AliasResolverObject,
                ...context.options.rollup.alias,
                entries: resolvedAliases,
            }),

            ...prePlugins,

            nodeResolver,

            ...normalPlugins,

            await memoizeDtsPluginByKey(uniqueProcessId)(context),

            context.options.emitCJS && fixDtsDefaultCjsExportsPlugin(),

            context.options.cjsInterop
            && context.options.emitCJS
            && cjsInteropPlugin({
                ...context.options.rollup.cjsInterop,
                logger: context.logger,
            }),

            context.options.rollup.patchTypes && cachingPlugin(patchTypescriptTypesPlugin(context.options.rollup.patchTypes, context.logger), fileCache),

            removeShebangPlugin(),

            ...postPlugins,

            context.options.rollup.license
            && context.options.rollup.license.path
            && typeof context.options.rollup.license.dtsTemplate === "function"
            && licensePlugin({
                licenseFilePath: context.options.rollup.license.path,
                licenseTemplate: context.options.rollup.license.dtsTemplate,
                logger: context.logger,
                marker: context.options.rollup.license.dtsMarker ?? "TYPE_DEPENDENCIES",
                mode: "types",
                packageName: context.pkg.name,
            }),
        ].filter(Boolean),
    };
};
