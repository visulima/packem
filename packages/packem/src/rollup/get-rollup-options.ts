import { readdirSync } from "node:fs";
import { versions } from "node:process";

import type { ResolverObject } from "@rollup/plugin-alias";
import aliasPlugin from "@rollup/plugin-alias";
import commonjsPlugin from "@rollup/plugin-commonjs";
import dynamicImportVarsPlugin from "@rollup/plugin-dynamic-import-vars";
import { nodeResolve as nodeResolvePlugin } from "@rollup/plugin-node-resolve";
import replacePlugin from "@rollup/plugin-replace";
import { wasm as wasmPlugin } from "@rollup/plugin-wasm";
import { cyan } from "@visulima/colorize";
import { isAbsolute, join, relative, resolve } from "@visulima/path";
import type { TsConfigResult } from "@visulima/tsconfig";
import type { OutputOptions, Plugin, PreRenderedAsset, PreRenderedChunk, RollupLog, RollupOptions } from "rollup";
import polyfillPlugin from "rollup-plugin-polyfill-node";
import { visualizer as visualizerPlugin } from "rollup-plugin-visualizer";
import { minVersion } from "semver";

import { ENDING_RE } from "../constants";
import type { BuildContext, InternalBuildOptions } from "../types";
import arrayIncludes from "../utils/array-includes";
import arrayify from "../utils/arrayify";
import type FileCache from "../utils/file-cache";
import getPackageName from "../utils/get-package-name";
import memoizeByKey from "../utils/memoize";
import chunkSplitter from "./plugins/chunk-splitter";
import { cjsInteropPlugin } from "./plugins/cjs-interop";
import { copyPlugin } from "./plugins/copy";
import cssPlugin from "./plugins/css";
import type { EsbuildPluginConfig } from "./plugins/esbuild/types";
import { esmShimCjsSyntaxPlugin } from "./plugins/esm-shim-cjs-syntax";
import fixDynamicImportExtension from "./plugins/fix-dynamic-import-extension";
import { isolatedDeclarationsPlugin } from "./plugins/isolated-declarations";
import JSONPlugin from "./plugins/json";
import { jsxRemoveAttributes } from "./plugins/jsx-remove-attributes";
import { license as licensePlugin } from "./plugins/license";
import metafilePlugin from "./plugins/metafile";
import { node10CompatibilityPlugin } from "./plugins/node10-compatibility-plugin";
import cachingPlugin from "./plugins/plugin-cache";
import prependDirectivePlugin from "./plugins/prepend-directives";
import preserveDirectivesPlugin from "./plugins/preserve-directives";
import { rawPlugin } from "./plugins/raw";
import resolveFileUrlPlugin from "./plugins/resolve-file-url";
import type { ShebangOptions } from "./plugins/shebang";
import { removeShebangPlugin, shebangPlugin } from "./plugins/shebang";
import type { SucrasePluginConfig } from "./plugins/sucrase/types";
import type { SwcPluginConfig } from "./plugins/swc/types";
import { patchTypescriptTypes as patchTypescriptTypesPlugin } from "./plugins/typescript/patch-typescript-types";
import { getConfigAlias, resolveTsconfigPaths as resolveTsconfigPathsPlugin } from "./plugins/typescript/resolve-tsconfig-paths";
import resolveTsconfigRootDirectoriesPlugin from "./plugins/typescript/resolve-tsconfig-root-dirs";
import resolveTypescriptMjsCtsPlugin from "./plugins/typescript/resolve-typescript-mjs-cjs";
import appendPlugins from "./utils/append-plugins";
import createSplitChunks from "./utils/chunks/create-split-chunks";
import getChunkFilename from "./utils/get-chunk-filename";
import getEntryFileNames from "./utils/get-entry-file-names";
import resolveAliases from "./utils/resolve-aliases";

const getTransformerConfig = (
    name: InternalBuildOptions["transformerName"],
    context: BuildContext,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): SwcPluginConfig | SucrasePluginConfig | EsbuildPluginConfig => {
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

        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        let nodeTarget = "node" + versions.node.split(".")[0];

        if (context.pkg.engines?.node) {
            const minNodeVersion = minVersion(context.pkg.engines.node);

            if (minNodeVersion) {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                nodeTarget = "node" + minNodeVersion.major;
            }
        }

        // Add node target to esbuild target
        if (context.options.rollup.esbuild.target) {
            const targets = arrayify(context.options.rollup.esbuild.target);

            if (!targets.some((t) => t.startsWith("node"))) {
                context.options.rollup.esbuild.target = [...new Set([...arrayify(nodeTarget), ...targets])];
            }
        } else {
            context.options.rollup.esbuild.target = arrayify(nodeTarget);
        }

        if (context.tsconfig?.config.compilerOptions?.target === "es5") {
            context.options.rollup.esbuild.keepNames = false;

            context.logger.debug("Disabling keepNames because target is set to es5");
        }

        return {
            logger: context.logger,
            minify: context.options.minify,
            // eslint-disable-next-line no-secrets/no-secrets
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

    throw new Error(`A Unknown transformer was provided`);
};

const sharedOnWarn = (warning: RollupLog, context: BuildContext): boolean => {
    // If the circular dependency warning is from node_modules, ignore it
    if (warning.code === "CIRCULAR_DEPENDENCY" && /Circular dependency:[\s\S]*node_modules/.test(warning.message)) {
        return true;
    }

    // eslint-disable-next-line no-secrets/no-secrets
    // @see https:// github.com/rollup/rollup/blob/5abe71bd5bae3423b4e2ee80207c871efde20253/cli/run/batchWarnings.ts#L236
    if (warning.code === "UNRESOLVED_IMPORT") {
        throw new Error(
            `Failed to resolve the module "${warning.exporter as string}" imported by "${cyan(relative(resolve(), warning.id as string))}"` +
                `\nIs the module installed? Note:` +
                `\n ↳ to inline a module into your bundle, install it to "devDependencies".` +
                `\n ↳ to depend on a module via import/require, install it to "dependencies".`,
        );
    }

    if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
        return true;
    }

    return warning.code === "MIXED_EXPORTS" && context.options.cjsInterop === true;
};

const calledImplicitExternals = new Map<string, boolean>();
const cachedGlobFiles = new Map<string, string[]>();

// eslint-disable-next-line sonarjs/cognitive-complexity
const baseRollupOptions = (context: BuildContext, resolvedAliases: Record<string, string>, type: "dependencies" | "dts"): RollupOptions => {
    const findAlias = (id: string): string | undefined => {
        for (const [key, replacement] of Object.entries(resolvedAliases)) {
            if (id.startsWith(key)) {
                return id.replace(key, replacement);
            }
        }

        return undefined;
    };

    const configAlias = getConfigAlias(context.tsconfig, false);

    return <RollupOptions>{
        external(id) {
            const foundAlias = findAlias(id);

            if (foundAlias) {
                // eslint-disable-next-line no-param-reassign
                id = foundAlias;
            }

            // eslint-disable-next-line @typescript-eslint/naming-convention
            const package_ = getPackageName(id);

            if (arrayIncludes(context.options.externals, package_) || arrayIncludes(context.options.externals, id)) {
                return true;
            }

            const { pkg } = context;

            if (id.startsWith(".") || isAbsolute(id) || /src[/\\]/.test(id) || (pkg.name && id.startsWith(pkg.name))) {
                return false;
            }

            // package.json imports are not externals
            if (pkg.imports) {
                for (const [key, value] of Object.entries(pkg.imports)) {
                    if (key === id) {
                        return false;
                    }

                    // if a glob is used, we need to check if the id matches the files in the source directory
                    if (key.includes("*")) {
                        let files: string[];

                        if (cachedGlobFiles.has(key)) {
                            files = cachedGlobFiles.get(key) as string[];
                        } else {
                            // eslint-disable-next-line security/detect-non-literal-fs-filename
                            files = readdirSync(join(context.options.rootDir, (value as string).replace("/*", "")), { withFileTypes: true })
                                .filter((dirent) => dirent.isFile())
                                .map((dirent) => dirent.name);

                            cachedGlobFiles.set(key, files);
                        }

                        for (const file of files) {
                            if (file.replace(ENDING_RE, "") === id.replace(ENDING_RE, "").replace("#", "")) {
                                return false;
                            }
                        }
                    }
                }
            }

            if (configAlias) {
                for (const { find } of configAlias) {
                    if (find.test(id)) {
                        context.logger.debug({
                            message: `Resolved alias ${id} to ${find.source}`,
                            prefix: type,
                        });

                        return false;
                    }
                }
            }

            if (!calledImplicitExternals.has(id)) {
                context.logger.info({
                    message: 'Inlined implicit external "' + cyan(id) + '". If this is incorrect, add it to the "externals" option.',
                    prefix: type,
                });
            }

            calledImplicitExternals.set(id, true);

            return false;
        },
        input: Object.fromEntries(context.options.entries.map((entry) => [entry.name, resolve(context.options.rootDir, entry.input)])),

        logLevel: context.options.debug ? "debug" : "info",

        onLog: (level, log) => {
            let format = log.message;

            if (log.stack) {
                format = `${format}\n${log.stack}`;
            }

            // eslint-disable-next-line default-case
            switch (level) {
                case "info": {
                    context.logger.info({
                        message: format,
                        prefix: type + (log.plugin ? ":plugin:" + log.plugin : ""),
                    });
                    return;
                }
                case "warn": {
                    context.logger.warn({
                        message: format,
                        prefix: type + (log.plugin ? ":plugin:" + log.plugin : ""),
                    });
                    return;
                }
                case "debug": {
                    context.logger.debug({
                        message: format,
                        prefix: type + (log.plugin ? ":plugin:" + log.plugin : ""),
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

        watch: context.mode === "watch" ? context.options.rollup.watch : false,
    };
};

// eslint-disable-next-line sonarjs/cognitive-complexity,import/exports-last
export const getRollupOptions = async (context: BuildContext, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context, "build");

    let nodeResolver;

    if (context.options.rollup.resolve) {
        nodeResolver = cachingPlugin(
            nodeResolvePlugin({
                ...context.options.rollup.resolve,
            }),
            fileCache,
        );
    }

    const chunking = context.options.rollup.output?.preserveModules
        ? {
              preserveModules: true,
              preserveModulesRoot: context.options.rollup.output.preserveModulesRoot ?? "src",
          }
        : { manualChunks: createSplitChunks(context.dependencyGraphMap, context.buildEntries), preserveModules: false };

    return (<RollupOptions>{
        ...baseRollupOptions(context, resolvedAliases, "dependencies"),

        output: [
            context.options.emitCJS &&
                <OutputOptions>{
                    // Governs names of CSS files (for assets from CSS use `hash` option for url handler).
                    // Note: using value below will put `.css` files near js,
                    // but make sure to adjust `hash`, `assetDir` and `publicPath`
                    // options for url handler accordingly.
                    assetFileNames: "[name]-[hash][extname]",
                    chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, "cjs"),
                    dir: resolve(context.options.rootDir, context.options.outDir),
                    entryFileNames: (chunkInfo: PreRenderedAsset) => getEntryFileNames(chunkInfo, "cjs"),
                    exports: "auto",
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
                    // By default, in rollup, when creating multiple chunks, transitive imports of entry chunks
                    // will be added as empty imports to the entry chunks. Disable to avoid imports hoist outside of boundaries
                    hoistTransitiveImports: false,
                    interop: "compat",
                    sourcemap: context.options.sourcemap,
                    validate: true,
                    ...context.options.rollup.output,
                    ...chunking,
                },
            context.options.emitESM &&
                <OutputOptions>{
                    // Governs names of CSS files (for assets from CSS use `hash` option for url handler).
                    // Note: using value below will put `.css` files near js,
                    // but make sure to adjust `hash`, `assetDir` and `publicPath`
                    // options for url handler accordingly.
                    assetFileNames: "[name]-[hash][extname]",
                    chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, "mjs"),
                    dir: resolve(context.options.rootDir, context.options.outDir),
                    entryFileNames: (chunkInfo: PreRenderedAsset) => getEntryFileNames(chunkInfo, "mjs"),
                    exports: "auto",
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

        plugins: appendPlugins(
            [
                cachingPlugin(resolveFileUrlPlugin(), fileCache),
                cachingPlugin(resolveTypescriptMjsCtsPlugin(), fileCache),

                context.tsconfig && cachingPlugin(resolveTsconfigRootDirectoriesPlugin(context.options.rootDir, context.logger, context.tsconfig), fileCache),
                context.tsconfig && cachingPlugin(resolveTsconfigPathsPlugin(context.tsconfig, context.logger), fileCache),

                context.options.rollup.replace &&
                    replacePlugin({
                        sourcemap: context.options.sourcemap,
                        ...context.options.rollup.replace,
                    }),

                context.options.rollup.alias &&
                    aliasPlugin({
                        // https://github.com/rollup/plugins/tree/master/packages/alias#custom-resolvers
                        customResolver: nodeResolver as ResolverObject,
                        ...context.options.rollup.alias,
                        entries: resolvedAliases,
                    }),

                nodeResolver,

                context.options.rollup.polyfillNode &&
                    polyfillPlugin({
                        sourceMap: context.options.sourcemap,
                        ...context.options.rollup.polyfillNode,
                    }),

                context.options.rollup.json &&
                    JSONPlugin({
                        ...context.options.rollup.json,
                    }),

                chunkSplitter(),

                context.options.rollup.wasm && wasmPlugin(context.options.rollup.wasm),

                // @TODO check if this can be moved into the dts build
                context.options.declaration &&
                    context.options.rollup.isolatedDeclarations &&
                    context.options.isolatedDeclarationTransformer &&
                    isolatedDeclarationsPlugin(
                        join(context.options.rootDir, context.options.sourceDir),
                        context.options.isolatedDeclarationTransformer,
                        context.options.declaration,
                        Boolean(context.options.rollup.cjsInterop),
                        context.options.rollup.isolatedDeclarations,
                    ),

                context.options.rollup.css &&
                    context.options.rollup.css.loaders &&
                    context.options.rollup.css.loaders.length > 0 &&
                    cssPlugin(
                        {
                            dts: Boolean(context.options.declaration) || context.options.isolatedDeclarationTransformer !== undefined,
                            sourceMap: context.options.sourcemap,
                            ...context.options.rollup.css,
                        },
                        context.logger,
                        context.options.browserTargets as string[],
                        context.options.rootDir,
                        context.options.sourceDir,
                        context.environment,
                        context.options.sourcemap,
                    ),

                context.options.transformer(getTransformerConfig(context.options.transformerName, context)),

                cachingPlugin(
                    preserveDirectivesPlugin({
                        directiveRegex: /^['|"](use (\w+))['|"]$/,
                        ...context.options.rollup.preserveDirectives,
                        logger: context.logger,
                    }),
                    fileCache,
                ),

                context.options.rollup.shebang &&
                    shebangPlugin(
                        context.options.entries
                            .filter((entry) => entry.executable)
                            .map((entry) => entry.name)
                            .filter(Boolean) as string[],
                        context.options.rollup.shebang as ShebangOptions,
                    ),

                context.options.cjsInterop &&
                    context.options.emitCJS &&
                    cjsInteropPlugin({
                        ...context.options.rollup.cjsInterop,
                        logger: context.logger,
                        type: context.pkg.type ?? "commonjs",
                    }),

                context.options.rollup.dynamicVars && fixDynamicImportExtension(),
                context.options.rollup.dynamicVars && dynamicImportVarsPlugin(context.options.rollup.dynamicVars),

                context.options.rollup.commonjs &&
                    cachingPlugin(
                        commonjsPlugin({
                            sourceMap: context.options.sourcemap,
                            ...context.options.rollup.commonjs,
                        }),
                        fileCache,
                    ),

                context.options.rollup.preserveDynamicImports &&
                    ({
                        name: "packem:preserve-dynamic-imports",
                        renderDynamicImport() {
                            return { left: "import(", right: ")" };
                        },
                    } as Plugin),

                context.options.cjsInterop && context.options.rollup.shim && esmShimCjsSyntaxPlugin(context.pkg, context.options.rollup.shim),

                context.options.rollup.raw && cachingPlugin(rawPlugin(context.options.rollup.raw), fileCache),

                context.options.rollup.jsxRemoveAttributes &&
                    cachingPlugin(
                        jsxRemoveAttributes({
                            attributes: context.options.rollup.jsxRemoveAttributes.attributes,
                            logger: context.logger,
                        }),
                        fileCache,
                    ),

                context.options.rollup.metafile &&
                    metafilePlugin({
                        outDir: resolve(context.options.rootDir, context.options.outDir),
                        rootDir: context.options.rootDir,
                    }),

                context.options.rollup.copy && copyPlugin(context.options.rollup.copy, context.logger),

                context.options.rollup.license &&
                    context.options.rollup.license.path &&
                    typeof context.options.rollup.license.dependenciesTemplate === "function" &&
                    licensePlugin({
                        dtsMarker: context.options.rollup.license.dtsMarker ?? "TYPE_DEPENDENCIES",
                        licenseFilePath: context.options.rollup.license.path,
                        licenseTemplate: context.options.rollup.license.dependenciesTemplate,
                        logger: context.logger,
                        marker: context.options.rollup.license.dependenciesMarker ?? "DEPENDENCIES",
                        mode: "dependencies",
                        packageName: context.pkg.name,
                    }),

                prependDirectivePlugin(),

                context.options.emitCJS &&
                    context.mode === "build" &&
                    context.options.declaration === "compatible" &&
                    context.options.rollup.node10Compatibility &&
                    node10CompatibilityPlugin(
                        context.logger,
                        context.options.entries,
                        context.options.outDir,
                        context.options.rootDir,
                        context.options.rollup.node10Compatibility.writeToPackageJson ? "file" : "console",
                        context.options.rollup.node10Compatibility.typeScriptVersion ?? "*",
                    ),

                context.options.analyze &&
                    context.options.rollup.visualizer !== false &&
                    visualizerPlugin({
                        brotliSize: true,
                        gzipSize: true,
                        projectRoot: context.options.rootDir,
                        sourcemap: context.options.sourcemap,
                        ...context.options.rollup.visualizer,
                        filename: "packem-bundle-analyze.html",
                        title: "Packem Visualizer",
                    }),
            ].filter(Boolean),
            context.options.rollup.plugins,
        ),
    }) as RollupOptions;
};

const createDtsPlugin = async (context: BuildContext): Promise<Plugin> => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports,@typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires,global-require,unicorn/prefer-module
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export const getRollupDtsOptions = async (context: BuildContext, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context, "types");
    const compilerOptions = context.tsconfig?.config.compilerOptions;

    delete compilerOptions?.lib;

    let nodeResolver;

    if (context.options.rollup.resolve) {
        nodeResolver = cachingPlugin(
            nodeResolvePlugin({
                ...context.options.rollup.resolve,
            }),
            fileCache,
        );
    }

    // Each process should be unique
    // Each package build should be unique
    // Composing above factors into a unique cache key to retrieve the memoized dts plugin with tsconfigs
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    const uniqueProcessId = ("dts-plugin:" + process.pid + (context.tsconfig as TsConfigResult).path) as string;

    return <RollupOptions>{
        ...baseRollupOptions(context, resolvedAliases, "dts"),

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
            context.options.emitCJS &&
                <OutputOptions>{
                    chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, "d.cts"),
                    dir: resolve(context.options.rootDir, context.options.outDir),
                    entryFileNames: "[name].d.cts",
                    format: "cjs",
                    sourcemap: context.options.sourcemap,
                    ...context.options.rollup.output,
                },
            context.options.emitESM &&
                <OutputOptions>{
                    chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, "d.mts"),
                    dir: resolve(context.options.rootDir, context.options.outDir),
                    entryFileNames: "[name].d.mts",
                    format: "esm",
                    sourcemap: context.options.sourcemap,
                    ...context.options.rollup.output,
                },
            // .d.ts for node10 compatibility (TypeScript version < 4.7)
            context.options.declaration === "compatible" &&
                <OutputOptions>{
                    chunkFileNames: (chunk: PreRenderedChunk) => getChunkFilename(chunk, "d.ts"),
                    dir: resolve(context.options.rootDir, context.options.outDir),
                    entryFileNames: "[name].d.ts",
                    format: "cjs",
                    sourcemap: context.options.sourcemap,
                    ...context.options.rollup.output,
                },
        ].filter(Boolean),

        plugins: appendPlugins(
            [
                cachingPlugin(resolveFileUrlPlugin(), fileCache),
                cachingPlugin(resolveTypescriptMjsCtsPlugin(), fileCache),

                context.options.rollup.json &&
                    JSONPlugin({
                        ...context.options.rollup.json,
                    }),

                <Plugin>{
                    load(id) {
                        if (!/\.(?:js|cjs|mjs|jsx|ts|tsx|ctsx|mtsx|mts|json)$/.test(id)) {
                            return "";
                        }

                        return null;
                    },
                    name: "packem:ignore-files",
                },

                context.tsconfig && cachingPlugin(resolveTsconfigRootDirectoriesPlugin(context.options.rootDir, context.logger, context.tsconfig), fileCache),
                context.tsconfig && cachingPlugin(resolveTsconfigPathsPlugin(context.tsconfig, context.logger), fileCache),

                context.options.rollup.replace &&
                    replacePlugin({
                        sourcemap: context.options.sourcemap,
                        ...context.options.rollup.replace,
                    }),

                context.options.rollup.alias &&
                    aliasPlugin({
                        // https://github.com/rollup/plugins/tree/master/packages/alias#custom-resolvers
                        customResolver: nodeResolver as ResolverObject,
                        ...context.options.rollup.alias,
                        entries: resolvedAliases,
                    }),

                nodeResolver,

                await memoizeDtsPluginByKey(uniqueProcessId)(context),

                context.options.cjsInterop &&
                    context.options.emitCJS &&
                    cjsInteropPlugin({
                        ...context.options.rollup.cjsInterop,
                        logger: context.logger,
                        type: context.pkg.type ?? "commonjs",
                    }),

                context.options.rollup.patchTypes && cachingPlugin(patchTypescriptTypesPlugin(context.options.rollup.patchTypes, context.logger), fileCache),

                removeShebangPlugin(),

                context.options.rollup.license &&
                    context.options.rollup.license.path &&
                    typeof context.options.rollup.license.dtsTemplate === "function" &&
                    licensePlugin({
                        licenseFilePath: context.options.rollup.license.path,
                        licenseTemplate: context.options.rollup.license.dtsTemplate,
                        logger: context.logger,
                        marker: context.options.rollup.license.dtsMarker ?? "TYPE_DEPENDENCIES",
                        mode: "types",
                        packageName: context.pkg.name,
                    }),
            ].filter(Boolean),
            context.options.rollup.plugins,
        ),
    };
};
