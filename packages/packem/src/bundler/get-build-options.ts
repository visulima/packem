import { cachingPlugin, createSplitChunks, fixDynamicImportExtension, metafilePlugin, resolveAliases, resolveFileUrlPlugin } from "@visulima/packem-plugins";
import { babelTransformPlugin } from "@visulima/packem-plugins/babel";
import { copyPlugin } from "@visulima/packem-plugins/plugin/copy";
import { dataUriPlugin } from "@visulima/packem-plugins/plugin/data-uri";
import { debarrelPlugin } from "@visulima/packem-plugins/plugin/debarrel";
import { detectDuplicatedPlugin } from "@visulima/packem-plugins/plugin/detect-duplicated";
import { esmShimCjsSyntaxPlugin } from "@visulima/packem-plugins/plugin/esm-shim-cjs-syntax";
import { externalsPlugin } from "@visulima/packem-plugins/plugin/externals";
import { importAttributesPlugin } from "@visulima/packem-plugins/plugin/import-attributes";
import { licensePlugin } from "@visulima/packem-plugins/plugin/license";
import { minifyHTMLLiteralsPlugin } from "@visulima/packem-plugins/plugin/minify-html-literals";
import { nativeModulesPlugin } from "@visulima/packem-plugins/plugin/native-modules";
import { rawPlugin } from "@visulima/packem-plugins/plugin/raw";
import { requireCJSTransformerPlugin } from "@visulima/packem-plugins/plugin/require-cjs-transformer";
import resolveImplicitExternalsPlugin from "@visulima/packem-plugins/plugin/resolve-implicit-externals";
import type { ShebangOptions } from "@visulima/packem-plugins/plugin/shebang";
import { shebangPlugin } from "@visulima/packem-plugins/plugin/shebang";
import { sourcemapsPlugin } from "@visulima/packem-plugins/plugin/source-maps";
import { urlPlugin } from "@visulima/packem-plugins/plugin/url";
import { resolveTsconfigPathsPlugin, resolveTsconfigRootDirectoriesPlugin, resolveTypescriptMjsCtsPlugin } from "@visulima/packem-plugins/typescript";
import type { RollupReplaceOptions } from "@visulima/packem-rollup";
import {
    chunkSplitter,
    commonjs as commonjsPlugin,
    dynamicImportVars as dynamicImportVariablesPlugin,
    importTrace,
    jsxRemoveAttributes,
    polyfillNode as polyfillPlugin,
    preserveDirectivesPlugin,
    replace as replacePlugin,
    visualizer as visualizerPlugin,
    wasm as wasmPlugin,
} from "@visulima/packem-rollup";
import { cjsInteropPlugin } from "@visulima/packem-rollup/plugin/cjs-interop";
import { JsonPlugin } from "@visulima/packem-rollup/plugin/json";
import type { FileCache } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import { getOutputExtension, sortUserPlugins } from "@visulima/packem-share/utils";
import { resolve } from "@visulima/path";
import type { OutputOptions, Plugin, RollupOptions } from "rollup";

import {
    BABEL_DEFAULT_INCLUDE_REGEX,
    baseRollupOptions,
    buildAliasPlugin,
    buildPurePlugins,
    createChunkFileNames,
    createEntryFileNames,
    createNodeResolver,
    getLogger,
    getTransformerConfig,
    PRESERVE_DIRECTIVE_REGEX,
    resolveEsmEntryExtension,
} from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";
import cloneReplaceOptions from "../utils/clone-replace-options";

// JS-build option construction is one shared (base) pipeline with two
// backend-specialised entry points:
//
// - base: the shared builder below — the full ordered plugin/output array
//   used by both backends. Plugin order is a HARD constraint (see the
//   eslint-disable) so the array stays a single template; the backend only
//   toggles which slots fill.
// - rollup (getRollupOptions, src/rollup/get-rollup-options.ts): base + the
//   rollup-only ecosystem plugins (node-resolve, json, cjs-interop, commonjs)
//   + the transformer adapter plugin (esbuild/swc/sucrase/oxc).
// - rolldown (getRolldownOptions, src/rolldown/get-rolldown-options.ts): base
//   only, then layered with rolldown's native `transform` input option.
//   Rolldown handles json / cjs-interop / commonjs / resolve natively, and
//   runs its own oxc-based transform — so none of those plugins are
//   constructed.
//
// Splitting at the entry point (rather than reading context.options.bundler
// deep in the body) keeps "don't load plugins we don't need" structural: the
// rolldown path never even instantiates the rollup-only plugins.
export type Backend = "rolldown" | "rollup";

// createJsBuildOptions is async both for its own work (it lazily `await import`s
// the heavy CSS plugin only when stylesheets are configured) and as the symmetric
// counterpart of the genuinely-async getRollupDtsOptions — both are consumed via
// await in bundler/build.ts and rollup/watch.ts, so the shared call contract stays
// uniform.
// eslint-disable-next-line sonarjs/cognitive-complexity -- residual complexity is the deliberate order-sensitive Rollup plugin/output array construction (HARD constraint forbids reordering it)
export const createJsBuildOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, backend: Backend): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context.pkg, context.options);
    // When the backend is rolldown, several rollup plugins are skipped because
    // rolldown handles those concerns natively (or is incompatible):
    //   - JsonPlugin           (rolldown parses JSON internally)
    //   - cjsInteropPlugin     (rolldown emits CJS-interop helpers itself)
    //   - commonjsPlugin       (rolldown reads CommonJS without a transform)
    //   - createNodeResolver   (rolldown uses its own resolver pipeline)
    //   - transformer adapter  (rolldown runs an oxc transform natively — see
    //                           getRolldownTransformOptions)
    // Each call site short-circuits on `!isRolldown` rather than encoding this
    // policy in one place — the plugins have different option shapes and the
    // surrounding `&&` chain expects a falsy value to drop the entry, so a
    // central gate would still need per-plugin glue.
    const isRolldown = backend === "rolldown";
    const nodeResolver = isRolldown ? undefined : createNodeResolver(context);

    // `@visulima/rollup-plugin-css` pulls in PostCSS / LightningCSS and the full
    // loader chain — a heavy import that's pointless for the many builds with no
    // stylesheets. Load it lazily, only when CSS loaders are actually configured,
    // so a JS/TS-only build never pays the cold-start cost. The plugin array below
    // is still gated by the same `css.loaders.length > 0` checks, so when those
    // terms are reached `cssPluginModule` is guaranteed defined (the `?.` only
    // exists to satisfy the type — it can never short-circuit on a reached term).
    const cssPluginModule
        = context.options.rollup.css && context.options.rollup.css.loaders && context.options.rollup.css.loaders.length > 0
            ? await import("@visulima/rollup-plugin-css")
            : undefined;

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- boolean OR is intended: a falsy `unbundle` must still fall through to the preserveModules check
    const usePreserveModules = Boolean(context.options.unbundle || context.options.rollup.output?.preserveModules);

    const chunking = usePreserveModules
        ? {
            preserveModules: true,
            preserveModulesRoot: context.options.rollup.output?.preserveModulesRoot ?? context.options.sourceDir,
        }
        : {
            // Directive-based layers ("use client"/"use server") only exist when the
            // preserve-directives plugin runs, which is rollup-only and gated on the
            // option. When it can't run, `getModuleLayer` always returns undefined, so
            // createSplitChunks can skip its expensive importer-layer graph walks.
            manualChunks: createSplitChunks(
                context.dependencyGraphMap,
                context.buildEntries,
                !isRolldown && Boolean(context.options.rollup.preserveDirectives),
            ),
            preserveModules: false,
        };

    const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(context.options.rollup.plugins, "build");

    // Add esm mark and interop helper if esm export is detected
    const useEsModuleMark = context.tsconfig?.config.compilerOptions?.esModuleInterop;

    const { pureNewExpressionPluginInstance, purePluginInstance } = buildPurePlugins(context);

    const options: RollupOptions = {
        ...baseRollupOptions(context, "build"),

        output: [
            context.options.emitCJS
            && <OutputOptions>{
                // Governs names of CSS files (for assets from CSS use `hash` option for url handler).
                // Note: using value below will put `.css` files near js,
                // but make sure to adjust `hash`, `assetDir` and `publicPath`
                // options for url handler accordingly.
                assetFileNames: "[name]-[hash][extname]",
                chunkFileNames: createChunkFileNames(() => getOutputExtension(context, "cjs"), usePreserveModules),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: createEntryFileNames((_chunk) => getOutputExtension(context, "cjs"), usePreserveModules),
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
                chunkFileNames: createChunkFileNames(() => getOutputExtension(context, "esm"), usePreserveModules),
                compact: context.options.minify,
                dir: resolve(context.options.rootDir, context.options.outDir),
                entryFileNames: createEntryFileNames((chunk) => resolveEsmEntryExtension(context, chunk, usePreserveModules), usePreserveModules),
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
            // rollup-plugin-import-trace hooks rollup-specific error metadata to
            // build import chains on failure; rolldown's error format/internals
            // differ and the plugin doesn't apply.
            !isRolldown && importTrace(),

            importAttributesPlugin(),

            cachingPlugin(resolveFileUrlPlugin(), fileCache),

            externalsPlugin(context),
            // Runs on both backends: rolldown's native `extensionAlias` was prototyped
            // as a replacement, but a global alias can't match esbuild's context-sensitive
            // ordering (prefer .ts source, but prefer the shipped .js in node_modules), so
            // it mis-resolved packages shipping both .ts and .js. The plugin's resolveId is
            // already filtered to JS-extension ids, so the per-import cost is minimal.
            resolveTypescriptMjsCtsPlugin(),

            context.tsconfig && cachingPlugin(resolveTsconfigRootDirectoriesPlugin(context.options.rootDir, getLogger(context), context.tsconfig), fileCache),
            context.tsconfig
            && context.options.rollup.tsconfigPaths
            && cachingPlugin(
                resolveTsconfigPathsPlugin(context.options.rootDir, context.tsconfig, getLogger(context), context.options.rollup.tsconfigPaths),
                fileCache,
            ),

            resolveImplicitExternalsPlugin(context),

            context.options.rollup.replace
            // cloneReplaceOptions returns `any` by design (its RollupReplaceOptions index
            // signature can't be safely spread without a cast — see the helper's doc); the
            // produced object is structurally RollupReplaceOptions, so type it back here.
            && replacePlugin(cloneReplaceOptions(context.options.rollup.replace, { sourcemap: context.options.sourcemap }) as RollupReplaceOptions),

            context.options.rollup.alias && buildAliasPlugin(context, resolvedAliases, isRolldown, nodeResolver),

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

            !isRolldown
            && context.options.rollup.json
            && JsonPlugin({
                ...context.options.rollup.json,
            }),

            context.options.rollup.debarrel && debarrelPlugin(context.options.rollup.debarrel, getLogger(context)),

            // chunk-splitter parses module source via context.parse() in its
            // moduleParsed hook; see the rolldown note on the pure plugins.
            // Rolldown does native code-splitting, so this is rollup-only.
            !isRolldown && chunkSplitter(),

            context.options.rollup.wasm && wasmPlugin(context.options.rollup.wasm),

            context.options.rollup.url && urlPlugin(context.options.rollup.url),

            // `cssPluginModule` is truthy iff css.loaders is non-empty (it's loaded under
            // that exact condition above), so gating on it both selects the slot and lets
            // the type narrow to the loaded module — no non-null assertion needed.
            cssPluginModule
            && cachingPlugin(
                cssPluginModule.rollupCssPlugin(
                    {
                        dts: Boolean(context.options.declaration),
                        sourceMap: context.options.sourcemap,
                        ...context.options.rollup.css,
                    },
                    // For per-group browser builds the global `browserTargets` may
                    // have been cleared (when the global runtime is node), so fall
                    // back to the preserved `resolvedBrowserTargets`.
                    context.options.runtime === "browser" && (!context.options.browserTargets || context.options.browserTargets.length === 0)
                        ? context.options.resolvedBrowserTargets ?? []
                        : context.options.browserTargets ?? [],
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- boolean OR is intended: a falsy `declaration` must still fall through to the css.dts check
            && (context.options.declaration || context.options.rollup.css.dts)
            && cssPluginModule?.cssModulesTypesPlugin(context.options.rollup.css, context.options.rootDir),

            context.options.rollup.raw && cachingPlugin(rawPlugin(context.options.rollup.raw), fileCache),

            context.options.sourcemap && sourcemapsPlugin(context.options.rollup.sourcemap),

            ...normalPlugins,

            context.options.rollup.minifyHTMLLiterals
            && context.options.minify
            && minifyHTMLLiteralsPlugin({
                ...context.options.rollup.minifyHTMLLiterals,
                logger: getLogger(context),
            }),

            context.options.rollup.requireCJS
            && context.options.emitESM
            && cachingPlugin(
                requireCJSTransformerPlugin(
                    {
                        ...context.options.rollup.requireCJS,
                        cwd: context.options.rootDir,
                    },
                    getLogger(context),
                ),
                fileCache,
            ),

            context.options.rollup.babel
            && cachingPlugin(
                babelTransformPlugin({
                    include: context.options.rollup.babel.include ?? BABEL_DEFAULT_INCLUDE_REGEX,
                    ...context.options.rollup.babel,
                    root: context.options.rootDir,
                    sourceMaps: context.options.rollup.babel.sourceMaps ?? context.options.sourcemap,
                }),
                fileCache,
            ),

            // pure-new-expression-plugin and rollup-plugin-pure both call
            // this.parse() on module source in their transform hook. Under
            // rolldown the native transform runs AFTER plugin transform hooks
            // (and this.parse() has no filename, so it parses as plain JS),
            // so they would choke on raw TS/JSX. Their only job is emitting
            // /*#__PURE__*/ tree-shaking hints, which rolldown's native
            // tree-shaking already covers — rollup-only.
            !isRolldown && pureNewExpressionPluginInstance,
            !isRolldown && purePluginInstance,

            context.options.rollup.detectDuplicated !== false
            && detectDuplicatedPlugin(getLogger(context), context.options.rootDir, context.options.rollup.detectDuplicated),

            !isRolldown
            && context.options.transformer
            && cachingPlugin(context.options.transformer(getTransformerConfig(context.options.transformerName, context)), fileCache),

            // preserve-directives parses module source via this.parse() in its
            // transform hook; see the rolldown note on the pure plugins above.
            !isRolldown
            && context.options.rollup.preserveDirectives
            && preserveDirectivesPlugin({
                directiveRegex: PRESERVE_DIRECTIVE_REGEX,
                ...context.options.rollup.preserveDirectives,
                logger: getLogger(context),
            }),

            context.options.rollup.shebang
            && shebangPlugin(
                context.options.entries
                    .filter((entry) => entry.executable)
                    .map((entry) => entry.name)
                    .filter(Boolean),
                context.options.rollup.shebang as ShebangOptions,
            ),

            !isRolldown
            && context.options.cjsInterop
            && context.options.emitCJS
            && cjsInteropPlugin({
                ...context.options.rollup.cjsInterop,
                logger: getLogger(context),
            }),

            context.options.rollup.dynamicVars && fixDynamicImportExtension(),
            // @rollup/plugin-dynamic-import-vars calls this.parse() on module
            // source in its transform hook. Rolldown applies its native
            // transform AFTER plugin transform hooks, so the plugin would parse
            // un-transpiled TS/JSX and throw. Rolldown resolves dynamic-import
            // globs natively, so this is rollup-only — same policy as the other
            // @rollup/* ecosystem plugins gated below.
            !isRolldown && context.options.rollup.dynamicVars && dynamicImportVariablesPlugin(context.options.rollup.dynamicVars),

            !isRolldown
            && context.options.rollup.commonjs
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

            // jsx-remove-attributes parses module source via this.parse() in
            // its transform hook; see the rolldown note on the pure plugins.
            !isRolldown
            && context.options.rollup.jsxRemoveAttributes
            && cachingPlugin(
                jsxRemoveAttributes({
                    attributes: context.options.rollup.jsxRemoveAttributes.attributes,
                    logger: getLogger(context),
                }),
                fileCache,
            ),

            ...postPlugins,

            context.options.rollup.metafile && metafilePlugin(),

            context.options.rollup.copy && copyPlugin(context.options.rollup.copy, getLogger(context)),

            // `license` is `LicenseOptions | false`; optional chaining does not
            // exclude `false`, so the later `.dtsMarker`/`.path`/… accesses
            // would be reads off `false` (error-typed). Narrow off `false` up
            // front so the whole `&&` chain sees `LicenseOptions`.
            context.options.rollup.license !== false
            && context.options.rollup.license?.path
            && typeof context.options.rollup.license.dependenciesTemplate === "function"
            && licensePlugin({
                dtsMarker: context.options.rollup.license.dtsMarker ?? "TYPE_DEPENDENCIES",
                licenseFilePath: context.options.rollup.license.path,
                licenseTemplate: context.options.rollup.license.dependenciesTemplate,
                logger: getLogger(context),
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
    };

    return options;
};

// Rollup-backend entry point. Lives here (not in src/rollup/get-rollup-options.ts)
// to keep the static module graph acyclic — get-rollup-options.ts exports the
// helpers this builder consumes, so a static back-edge would create a cycle
// that breaks esbuild's whole-program analysis.
export const getRollupOptions = (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> =>
    createJsBuildOptions(context, fileCache, "rollup");
