import { existsSync } from "node:fs";
import { versions } from "node:process";

import { cyan } from "@visulima/colorize";
import type { AliasResolverObject, RollupReplaceOptions } from "@visulima/packem-rollup";
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
    pureNewExpressionPlugin,
    purePlugin,
    replace as replacePlugin,
    resolveAliases,
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
import { externalsPlugin } from "@visulima/packem-rollup/plugin/externals";
import { fixDtsDefaultCjsExportsPlugin } from "@visulima/packem-rollup/plugin/fix-dts-default-cjs-exports";
import { importAttributesPlugin } from "@visulima/packem-rollup/plugin/import-attributes";
import { JsonPlugin } from "@visulima/packem-rollup/plugin/json";
import { jsxRemoveAttributes } from "@visulima/packem-rollup/plugin/jsx-remove-attributes";
import { licensePlugin } from "@visulima/packem-rollup/plugin/license";
import { minifyHTMLLiteralsPlugin } from "@visulima/packem-rollup/plugin/minify-html-literals";
import { nativeModulesPlugin } from "@visulima/packem-rollup/plugin/native-modules";
import { preserveDirectivesPlugin } from "@visulima/packem-rollup/plugin/preserve-directives";
import { rawPlugin } from "@visulima/packem-rollup/plugin/raw";
import { requireCJSTransformerPlugin } from "@visulima/packem-rollup/plugin/require-cjs-transformer";
import resolveImplicitExternalsPlugin from "@visulima/packem-rollup/plugin/resolve-implicit-externals";
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
import { relative, resolve } from "@visulima/path";
import { cssModulesTypesPlugin, rollupCssPlugin } from "@visulima/rollup-plugin-css";
import type { Options as DtsOptions } from "@visulima/rollup-plugin-dts";
import type { OutputOptions, Plugin, PreRenderedAsset, PreRenderedChunk, RollupLog, RollupOptions } from "rollup";
import { importTrace } from "rollup-plugin-import-trace";
import { minVersion } from "semver";

import type { InternalBuildOptions } from "../types";
import cloneReplaceOptions from "../utils/clone-replace-options";
import isDeclarationOnlyName from "../utils/is-declaration-only";

/**
 * Structural view of the Pail logger.
 *
 * `@visulima/pail`'s `dist/index.server.d.ts` re-exports `Pail` from a
 * non-existent `./pail.d.ts` (the real file is `./pail.server.d.ts`), so the
 * upstream `Pail` type used by `BuildContext.logger` resolves to an error type
 * and every logger access trips `no-unsafe-*`. The runtime logger
 * is `Console & ...` (Pail extends Console), and every consumer in this module
 * either calls `debug`/`info`/`warn` or passes the logger to a plugin that
 * types its parameter as `Console`. So narrow it to `Console` until the
 * upstream re-export is fixed.
 */
type Logger = Console;

const getLogger = (context: BuildContext<InternalBuildOptions>): Logger => {
    const contextWithLogger: { logger: unknown } = context;

    return contextWithLogger.logger as Logger;
};

const CIRCULAR_NODE_MODULES_REGEX = /Circular dependency:[\s\S]*node_modules/;
const MTS_EXTENSION_REGEX = /\.mts$/;
// eslint-disable-next-line sonarjs/single-character-alternation -- preserves the original Babel include pattern.
const BABEL_DEFAULT_INCLUDE_REGEX = /\.(?:m|c)?(?:j|t)sx?$/;
const PRESERVE_DIRECTIVE_REGEX = /^['|"](use (\w+))['|"]$/;
const SCRIPT_OR_JSON_EXTENSION_REGEX = /\.(?:[cm]?jsx?|[cm]?tsx?|json)$/;

const regExpOrStringToString = (pattern: RegExp | string): string => {
    if (pattern instanceof RegExp) {
        return pattern.source;
    }

    return pattern;
};

const computeDtsResolveKey = (dtsResolve: boolean | (string | RegExp)[]): string => {
    if (typeof dtsResolve === "boolean") {
        return String(dtsResolve);
    }

    const sources: string[] = [];

    for (const pattern of dtsResolve) {
        sources.push(regExpOrStringToString(pattern));
    }

    return sources.toSorted((a, b) => a.localeCompare(b)).join(",");
};

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
 * @param getExtension Function to get the output extension for a given chunk
 * @param usePreserveModules Whether preserveModules mode is enabled
 * @returns entryFileNames function for Rollup
 */
const createEntryFileNames = (getExtension: (chunk: PreRenderedChunk) => string, usePreserveModules: boolean) => {
    if (usePreserveModules) {
        return (chunkInfo: PreRenderedChunk): string | undefined => {
            const { name } = chunkInfo;

            if (isDeclarationOnlyName(name)) {
                return undefined;
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- rollup types `name` as non-null but it can be absent at runtime; "[name]" is the rollup placeholder fallback
            return `${name ?? "[name]"}.${getExtension(chunkInfo)}`;
        };
    }

    return (chunkInfo: PreRenderedChunk): string | undefined => {
        const { name } = chunkInfo;

        if (isDeclarationOnlyName(name)) {
            return undefined;
        }

        return getEntryFileNames(chunkInfo as unknown as PreRenderedAsset, getExtension(chunkInfo));
    };
};

const resolveNodeTarget = (context: BuildContext<InternalBuildOptions>): string => {
    const defaultTarget = `node${versions.node.split(".")[0]}`;

    if (!context.pkg.engines?.node) {
        return defaultTarget;
    }

    const minNodeVersion = minVersion(context.pkg.engines.node);

    if (minNodeVersion) {
        return `node${String(minNodeVersion.major)}`;
    }

    return defaultTarget;
};

const resolveTransformerTarget = (context: BuildContext<InternalBuildOptions>, currentTarget: string | string[] | undefined, nodeTarget: string): string[] => {
    if (currentTarget) {
        const targets = arrayify(currentTarget);

        if (context.options.runtime === "node") {
            return [...new Set([nodeTarget, ...targets])];
        }

        if (context.options.runtime === "browser") {
            return [...new Set([...browserslistToEsbuild(context.options.browserTargets ?? []), ...targets])];
        }

        return targets;
    }

    return context.options.runtime === "node" ? [nodeTarget] : browserslistToEsbuild(context.options.browserTargets ?? []);
};

const getEsbuildTransformerConfig = (context: BuildContext<InternalBuildOptions>, nodeTarget: string): EsbuildPluginConfig => {
    if (!context.options.rollup.esbuild) {
        throw new Error("No esbuild options found in your configuration.");
    }

    if (context.tsconfig?.config.compilerOptions?.target?.toLowerCase() === "es3") {
        getLogger(context).warn(
            [
                "ES3 target is not supported by esbuild, so ES5 will be used instead..",
                "Please set 'target' option in tsconfig to at least ES5 to disable this error",
            ].join(" "),
        );

        context.tsconfig.config.compilerOptions.target = "es5";
        context.options.rollup.esbuild.target = "es5";
    }

    // Add targets to esbuild target
    context.options.rollup.esbuild.target = resolveTransformerTarget(context, context.options.rollup.esbuild.target, nodeTarget);

    // keepNames is not needed when minify is disabled.
    // Also transforming multiple times with keepNames enabled breaks tree-shaking.
    if (!context.options.minify) {
        context.options.rollup.esbuild.keepNames = false;

        getLogger(context).debug("Disabling keepNames because minify is disabled");
    }

    if (context.tsconfig?.config.compilerOptions?.target === "es5") {
        context.options.rollup.esbuild.keepNames = false;

        getLogger(context).debug("Disabling keepNames because target is set to es5");
    }

    return {
        logger: getLogger(context),
        minify: context.options.minify,

        /* eslint-disable no-secrets/no-secrets -- public reference URL in the attribution comment below, not a secret */
        /*
         * Smaller output for cache and marginal performance improvement:
         * https://twitter.com/evanwallace/status/1396336348366180359?s=20
         *
         * minifyIdentifiers is disabled because debuggers don't use the
         * `names` property from the source map
         *
         * minifySyntax is disabled because it does some tree-shaking
         * eg. unused try-catch error variable
         */
        /* eslint-enable no-secrets/no-secrets -- re-enable after the attribution comment */
        minifyWhitespace: context.options.minify,
        sourceMap: context.options.sourcemap,
        ...context.options.rollup.esbuild,
    } satisfies EsbuildPluginConfig;
};

const getSwcTransformerConfig = (context: BuildContext<InternalBuildOptions>): SwcPluginConfig => {
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
};

const getOxcTransformerConfig = (context: BuildContext<InternalBuildOptions>, nodeTarget: string): InternalOXCTransformPluginConfig => {
    if (!context.options.rollup.oxc) {
        throw new Error("No oxc options found in your configuration.");
    }

    const { jsx: oxcJsx } = context.options.rollup.oxc;

    let resolvedOxcJsx: typeof oxcJsx;

    if (typeof oxcJsx === "string") {
        resolvedOxcJsx = oxcJsx;
    } else if (oxcJsx) {
        resolvedOxcJsx = {
            ...oxcJsx,
            // This is not needed in a library.
            refresh: false,
        };
    } else {
        resolvedOxcJsx = undefined;
    }

    context.options.rollup.oxc = {
        ...context.options.rollup.oxc,
        cwd: context.options.rootDir,
        jsx: resolvedOxcJsx,
        sourcemap: context.options.sourcemap,
        typescript: context.tsconfig?.config
            ? {
                allowDeclareFields: true,
                allowNamespaces: true,
                declaration: undefined,
                jsxPragma: context.tsconfig.config.compilerOptions?.jsxFactory,
                jsxPragmaFrag: context.tsconfig.config.compilerOptions?.jsxFragmentFactory,
                onlyRemoveTypeImports: true,
                // Declaration generation is handled by @visulima/rollup-plugin-dts
                rewriteImportExtensions: false,
            }
            : undefined,
    } satisfies InternalOXCTransformPluginConfig;

    // Add targets to oxc target
    context.options.rollup.oxc.target = resolveTransformerTarget(context, context.options.rollup.oxc.target, nodeTarget);

    return context.options.rollup.oxc satisfies InternalOXCTransformPluginConfig;
};

const resolveEsmEntryExtension = (context: BuildContext<InternalBuildOptions>, chunk: PreRenderedChunk, usePreserveModules: boolean): string => {
    // In unbundle/preserveModules mode, use plain .js for all preserved
    // module files. Each source file retains its own output, so format
    // disambiguation via .mjs is not needed at the individual file level.
    // NOTE: In unbundle mode, inferEntries is skipped so emitCJS may be
    // undefined even when the package declares a .cjs main field; the
    // unbundle check must come first to prevent misdetection as ESM-only.
    if (usePreserveModules) {
        return "js";
    }

    if (chunk.facadeModuleId?.endsWith(".mts")) {
        const ctsPath = chunk.facadeModuleId.replace(MTS_EXTENSION_REGEX, ".cts");

        if (existsSync(ctsPath)) {
            return "mjs";
        }
    }

    // For ESM-only sub-contexts in dual-format packages (where the overall
    // package also emits CJS), use .mjs to disambiguate from CJS .js files.
    // This handles environment-specific entries (browser/server/development)
    // that are ESM-only but belong to a package that also has CJS output.
    if (!context.options.emitCJS && context.options.emitESM) {
        const pkgMain = (context.pkg as { main?: string }).main;

        if (pkgMain?.endsWith(".cjs")) {
            return "mjs";
        }
    }

    return getOutputExtension(context, "esm");
};

const getTransformerConfig = (
    name: InternalBuildOptions["transformerName"],
    context: BuildContext<InternalBuildOptions>,
): EsbuildPluginConfig | InternalOXCTransformPluginConfig | SucrasePluginConfig | SwcPluginConfig => {
    const nodeTarget = resolveNodeTarget(context);

    if (name === "esbuild") {
        return getEsbuildTransformerConfig(context, nodeTarget);
    }

    if (name === "swc") {
        return getSwcTransformerConfig(context);
    }

    if (name === "sucrase") {
        if (!context.options.rollup.sucrase) {
            throw new Error("No sucrase options found in your configuration.");
        }

        return context.options.rollup.sucrase satisfies SucrasePluginConfig;
    }

    if (name === "oxc") {
        return getOxcTransformerConfig(context, nodeTarget);
    }

    throw new Error(`A Unknown transformer was provided`);
};

const createNodeResolver = (context: BuildContext<InternalBuildOptions>): Plugin | undefined => {
    if (context.options.rollup.resolve && !context.options.experimental?.oxcResolve) {
        return nodeResolvePlugin({
            ...context.options.rollup.resolve,
        });
    }

    if (context.options.experimental?.oxcResolve && context.options.rollup.experimental?.resolve) {
        return oxcResolvePlugin(context.options.rollup.experimental.resolve, context.options.rootDir, getLogger(context), context.tsconfig?.path);
    }

    return undefined;
};

const sharedOnWarn = (warning: RollupLog, context: BuildContext<InternalBuildOptions>): boolean => {
    // If the circular dependency warning is from node_modules, ignore it
    if (warning.code === "CIRCULAR_DEPENDENCY" && CIRCULAR_NODE_MODULES_REGEX.test(warning.message)) {
        return true;
    }

    // eslint-disable-next-line no-secrets/no-secrets
    // @see https:// github.com/rollup/rollup/blob/5abe71bd5bae3423b4e2ee80207c871efde20253/cli/run/batchWarnings.ts#L236
    if (warning.code === "UNRESOLVED_IMPORT") {
        const error: Error & { id?: string } = new Error(
            `Failed to resolve the module "${warning.exporter ?? ""}" imported by "${cyan(relative(resolve(), warning.id ?? ""))}"`
            + `\nIs the module installed? Note:`
            + `\n ↳ to inline a module into your bundle, install it to "devDependencies".`
            + `\n ↳ to depend on a module via import/require, install it to "dependencies".`,
        );

        // Preserve the file id so rollup-plugin-import-trace can build the import chain
        error.id = warning.id;

        throw error;
    }

    if (warning.code === "MODULE_LEVEL_DIRECTIVE") {
        return true;
    }

    return warning.code === "MIXED_EXPORTS" && (context.options.cjsInterop ?? false);
};

const buildInputMap = (context: BuildContext<InternalBuildOptions>): Record<string, string> => {
    const input: Record<string, string> = {};

    for (const entry of context.options.entries) {
        if (entry.name === undefined) {
            continue;
        }

        const { name } = entry;
        const resolved = resolve(context.options.rootDir, entry.input);

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, sonarjs/different-types-comparison -- Record index type lies without noUncheckedIndexedAccess; input[name] is undefined at runtime for not-yet-seen names
        if (input[name] !== undefined && input[name] !== resolved) {
            throw new Error(
                `Duplicate rollup input name "${name}" — one maps to "${input[name]}", another to "${resolved}". Each entry must have a unique name.`,
            );
        }

        input[name] = resolved;
    }

    return input;
};

const formatRollupLog = (log: RollupLog): string => {
    if (log.stack) {
        return `${log.message}\n${log.stack}`;
    }

    return log.message;
};

const throwIfUnresolvedImportIsError = (context: BuildContext<InternalBuildOptions>, level: string, log: RollupLog, format: string): void => {
    // Handle unresolved import warnings from node-resolve plugin
    if (!(level === "warn" && log.plugin === "node-resolve" && format.includes("Could not resolve import"))) {
        return;
    }

    const unresolvedImportBehavior
        = context.options.rollup.resolve && typeof context.options.rollup.resolve === "object"
            ? context.options.rollup.resolve.unresolvedImportBehavior ?? "error"
            : "error";

    if (unresolvedImportBehavior === "error") {
        const error: Error & { id?: string } = new Error(format);

        // Preserve the file id so rollup-plugin-import-trace can build the import chain
        if (log.id) {
            error.id = log.id;
        }

        throw error;
    }
    // If "warn", fall through to the warn case below
};

const handleRollupLog = (context: BuildContext<InternalBuildOptions>, type: "build" | "dts", level: "debug" | "info" | "warn", log: RollupLog): void => {
    // DTS builds run in emitDtsOnly mode, so the JS chunk for every entry is empty
    // by design. Suppress the EMPTY_BUNDLE warnings here — onwarn already filters them
    // but onLog runs first and would otherwise log every empty entry.
    if (type === "dts" && log.code === "EMPTY_BUNDLE") {
        return;
    }

    const format = formatRollupLog(log);

    throwIfUnresolvedImportIsError(context, level, log, format);

    const prefix = type + (log.plugin ? `:plugin:${log.plugin}` : "");

    // eslint-disable-next-line default-case
    switch (level) {
        case "info": {
            getLogger(context).info({ message: format, prefix });

            return;
        }
        case "warn": {
            getLogger(context).warn({ message: format, prefix });

            return;
        }
        case "debug": {
            getLogger(context).debug({ message: format, prefix });
        }
    }
};

const baseRollupOptions = (context: BuildContext<InternalBuildOptions>, type: "build" | "dts"): RollupOptions => {
    return {
        input: buildInputMap(context),

        logLevel: context.options.debug ? "debug" : "info",

        onLog: (level, log) => {
            handleRollupLog(context, type, level, log);
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
};

const buildAliasPlugin = (
    context: BuildContext<InternalBuildOptions>,
    resolvedAliases: ReturnType<typeof resolveAliases>,
    isRolldown: boolean,
    nodeResolver: Plugin | undefined,
): Plugin => {
    const aliasOptions = {
        ...context.options.rollup.alias,
        entries: resolvedAliases,
    } as Record<string, unknown>;

    if (!isRolldown && nodeResolver) {
        (aliasOptions as { customResolver: AliasResolverObject }).customResolver = nodeResolver as AliasResolverObject;
    }

    return aliasPlugin(aliasOptions);
};

const buildPurePlugins = (
    context: BuildContext<InternalBuildOptions>,
): { pureNewExpressionPluginInstance: Plugin | undefined; purePluginInstance: Plugin | undefined } => {
    if (!context.options.rollup.pure) {
        return { pureNewExpressionPluginInstance: undefined, purePluginInstance: undefined };
    }

    const purePluginInstance = purePlugin({
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

            // `PureAnnotationsOptions.functions` is declared required `(string|RegExp)[]`,
            // but packem's default `pure: {}` (see generateOptions) supplies no
            // `functions` key, so this is `undefined` at runtime for the common
            // (unconfigured) case — the type lies, the `?? []` is load-bearing.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- default `pure: {}` has no `functions` prop; value is genuinely undefined at runtime despite the required type
            ...context.options.rollup.pure.functions ?? [],
        ],
        sourcemap: context.options.sourcemap,
    });

    // @ts-expect-error Hacking into the plugin ignoring types, we just fixed the order
    purePluginInstance.transform.order = "pre";

    // Companion plugin for annotating `new Constructor()` expressions (NewExpression nodes),
    // which rollup-plugin-pure does not handle (it only covers CallExpression nodes).
    const pureNewExpressionPluginInstance = pureNewExpressionPlugin({
        constructors: [
            "Proxy",
            "WeakMap",
            "WeakSet",
            "WeakRef",

            // Same as above: default `pure: {}` makes `.functions` undefined at
            // runtime despite the required declared type, so both the optional
            // chain and the `?? []` fallback are load-bearing here.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- default `pure: {}` has no `functions` prop; value is genuinely undefined at runtime despite the required type
            ...((context.options.rollup.pure.functions?.filter((f: string | RegExp) => typeof f === "string" && !f.includes(".")) ?? []) as string[]),
        ],
        sourcemap: context.options.sourcemap,
    });

    return { pureNewExpressionPluginInstance, purePluginInstance };
};

// getRollupOptions currently performs no await (its only one was a spurious
// await of the synchronous rollupCssPlugin, since removed), but it is kept as
// an async function returning a promise on purpose: it is the symmetric
// counterpart of the genuinely-async getRollupDtsOptions, and both are
// consumed via await in bundler/build.ts and rollup/watch.ts. Demoting only
// one of the pair to sync would split that shared call contract.
// eslint-disable-next-line import/exports-last, sonarjs/cognitive-complexity, @typescript-eslint/require-await -- residual complexity is the deliberate order-sensitive Rollup plugin/output array construction (HARD constraint forbids reordering it); the async signature is an intentional API-contract symmetry with getRollupDtsOptions, not accidental
export const getRollupOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context.pkg, context.options);
    // When the bundler is rolldown, several rollup plugins are skipped because
    // rolldown handles those concerns natively (or is incompatible):
    //   - JsonPlugin           (rolldown parses JSON internally)
    //   - cjsInteropPlugin     (rolldown emits CJS-interop helpers itself)
    //   - commonjsPlugin       (rolldown reads CommonJS without a transform)
    //   - createNodeResolver   (rolldown uses its own resolver pipeline)
    // Each call site short-circuits on `!isRolldown` rather than encoding this
    // policy in one place — the plugins have different option shapes and the
    // surrounding `&&` chain expects a falsy value to drop the entry, so a
    // central gate would still need per-plugin glue.
    const isRolldown = context.options.bundler === "rolldown";
    const nodeResolver = isRolldown ? undefined : createNodeResolver(context);

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- boolean OR is intended: a falsy `unbundle` must still fall through to the preserveModules check
    const usePreserveModules = Boolean(context.options.unbundle || context.options.rollup.output?.preserveModules);

    const chunking = usePreserveModules
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

    const { pureNewExpressionPluginInstance, purePluginInstance } = buildPurePlugins(context);

    return {
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
            importTrace(),

            importAttributesPlugin(),

            cachingPlugin(resolveFileUrlPlugin(), fileCache),

            externalsPlugin(context),
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

            chunkSplitter(),

            context.options.rollup.wasm && wasmPlugin(context.options.rollup.wasm),

            context.options.rollup.url && urlPlugin(context.options.rollup.url),

            context.options.rollup.css
            && context.options.rollup.css.loaders
            && context.options.rollup.css.loaders.length > 0
            && cachingPlugin(
                rollupCssPlugin(
                    {
                        dts: Boolean(context.options.declaration),
                        sourceMap: context.options.sourcemap,
                        ...context.options.rollup.css,
                    },
                    context.options.browserTargets ?? [],
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
            && cssModulesTypesPlugin(context.options.rollup.css, context.options.rootDir),

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

            pureNewExpressionPluginInstance,
            purePluginInstance,

            cachingPlugin(context.options.transformer(getTransformerConfig(context.options.transformerName, context)), fileCache),

            context.options.rollup.preserveDirectives
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
            context.options.rollup.dynamicVars && dynamicImportVariablesPlugin(context.options.rollup.dynamicVars),

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

            context.options.rollup.jsxRemoveAttributes
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
};

/*
 * Compute the effective `resolve` list for the DTS build.
 *
 * Automatically includes:
 * - `optionalDependencies` — consumers may not install these
 * - Peer dependencies marked as optional in `peerDependenciesMeta` — consumers
 *   only install the ones they need (e.g. multi-framework libraries like unplugin)
 * - `devDependencies` that the JS build actually bundled — the JS build inlines
 *   devDeps by default (`resolveExternals.devDeps: false`), so the emitted .d.ts
 *   must follow suit. Without this, value-and-type re-exports like
 *   `export { type X, default as y } from "some-devdep"` stay external in the
 *   .d.ts while the .js inlines `y` into the bundle, leaving consumers' builds
 *   to chase transitive specifiers that aren't runtime deps of the package.
 *
 * The user can extend or override via `rollup.dts.resolve`:
 * - `false` -> disable auto-resolution, keep all deps external in .d.ts
 * - `true`  -> inline ALL node_modules types
 * - `(string | RegExp)[]` -> merged with the auto-detected list
 */
const collectOptionalPeerDeps = (context: BuildContext<InternalBuildOptions>, peerDeps: Partial<Record<string, string>>, autoResolve: string[]): void => {
    if (!context.pkg.peerDependenciesMeta) {
        return;
    }

    for (const [name, meta] of Object.entries(context.pkg.peerDependenciesMeta)) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for malformed package.json: peerDependenciesMeta values come from untyped parsed JSON
        if (meta && typeof meta === "object" && "optional" in meta && meta.optional && name in peerDeps) {
            autoResolve.push(name);
        }
    }
};

const collectBundledDevDeps = (context: BuildContext<InternalBuildOptions>, peerDeps: Partial<Record<string, string>>, autoResolve: string[]): void => {
    // Include devDeps the JS build bundled. usedDependencies is populated by the
    // externals plugin during the JS build (which runs before DTS), so we only
    // inline devDeps that actually appeared in the bundled JS — skipping the
    // long tail of build-time-only devDeps (typescript, eslint, type-fest used
    // purely as local casts, …) that would otherwise bloat the emitted .d.ts.
    //
    // Exclude devDeps that are also declared as peerDependencies: the JS build
    // externalizes peer deps (consumer provides the runtime), so the emitted
    // .d.ts must match and keep them external too. Optional peer deps are
    // still inlined above to cover the multi-framework case.
    if (context.options.rollup.resolveExternals?.devDeps) {
        return;
    }

    for (const name of Object.keys(context.pkg.devDependencies ?? {})) {
        if (context.usedDependencies.has(name) && !(name in peerDeps)) {
            autoResolve.push(name);
        }
    }
};

const dedupeResolvePatterns = (merged: (string | RegExp)[]): (string | RegExp)[] => {
    const seen = new Set<string>();
    const deduped: (string | RegExp)[] = [];

    for (const entry of merged) {
        if (typeof entry === "string") {
            if (!seen.has(entry)) {
                seen.add(entry);
                deduped.push(entry);
            }
        } else {
            deduped.push(entry);
        }
    }

    return deduped;
};

// eslint-disable-next-line sonarjs/function-return-type -- the tri-state return is the deliberate dts-plugin `resolve` contract: false = disable, true = inline all, array = specific patterns
const computeDtsResolve = (context: BuildContext<InternalBuildOptions>): boolean | (string | RegExp)[] => {
    const userResolve = context.options.rollup.dts?.resolve;

    // User explicitly disabled → respect it
    if (userResolve === false) {
        return false;
    }

    // User wants everything → no need to compute
    if (userResolve === true) {
        return true;
    }

    // Auto-detect packages whose types should be inlined
    const autoResolve: string[] = Object.keys(context.pkg.optionalDependencies ?? {});

    // Include peer deps that are marked as optional in peerDependenciesMeta
    // (only if they're actually listed in peerDependencies)
    const peerDeps = context.pkg.peerDependencies ?? {};

    collectOptionalPeerDeps(context, peerDeps, autoResolve);
    collectBundledDevDeps(context, peerDeps, autoResolve);

    if (autoResolve.length === 0 && !userResolve) {
        return false;
    }

    // Merge and deduplicate auto-detected with user-provided patterns
    return dedupeResolvePatterns([...autoResolve, ...userResolve ?? []]);
};

const createDtsPlugin = async (context: BuildContext<InternalBuildOptions>, dtsResolve: boolean | (string | RegExp)[]): Promise<Plugin[]> => {
    const { dts } = await import("@visulima/rollup-plugin-dts");

    const userDtsOptions: DtsOptions = context.options.rollup.dts ?? {};

    return dts({
        ...userDtsOptions,
        compilerOptions: {
            ...userDtsOptions.compilerOptions,
            incremental: undefined,
            inlineSources: undefined,
            lib: undefined,
            sourceMap: undefined,
            tsBuildInfoFile: undefined,
        },
        // Only emit DTS files — prevents rollup from following non-TS imports
        // (e.g. raw data imports like `import txt from './file.txt'`) during the DTS build.
        // The generate plugin also handles direct .d.ts entries (without .ts sources)
        // by adding them to dtsMap and emitting them as chunks in emitDtsOnly mode.
        emitDtsOnly: true,
        // Use pre-computed resolve that auto-includes optional peer/optional deps.
        // This overrides any userDtsOptions.resolve from the spread above.
        resolve: dtsResolve,
        tsconfig: context.tsconfig?.path,
    });
};

// Avoid create multiple dts plugins instance and parsing the same tsconfig multi times,
// This will avoid memory leak and performance issue.
const memoizeDtsPluginByKey = memoizeByKey<typeof createDtsPlugin>(createDtsPlugin);

export const getRollupDtsOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context.pkg, context.options);
    const dtsResolve = computeDtsResolve(context);
    const nodeResolver = createNodeResolver(context);

    // Each process should be unique
    // Each package build should be unique
    // Composing above factors into a unique cache key to retrieve the memoized dts plugin with tsconfigs
    //
    // Include `dtsResolve` in the key: sibling builds (e.g. browser + node runtimes) share
    // the same process.pid + tsconfig path but can see different `usedDependencies` snapshots
    // when `computeDtsResolve` runs. Without this, the first build's stale list is cached and
    // re-used for later builds, which breaks direct-bypass inlining for devDeps that only
    // showed up after the first build finished.
    const resolveKey = computeDtsResolveKey(dtsResolve);
    const uniqueProcessId = `dts-plugin:${String(process.pid)}${context.tsconfig?.path ?? ""}:${resolveKey}`;

    const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(context.options.rollup.plugins, "dts");

    return {
        ...baseRollupOptions(context, "dts"),

        onwarn(warning, rollupWarn) {
            if (sharedOnWarn(warning, context)) {
                return;
            }

            if (warning.code === "EMPTY_BUNDLE") {
                return;
            }

            // Circular type references (`Node ↔ Alias`, `Document ↔ Schema`, …)
            // are standard in richly-typed packages like yaml. TypeScript resolves
            // these natively; rollup only flags them because its default bundler
            // heuristic is JS-focused. Skip them in the DTS build specifically —
            // the JS build still surfaces real circular-runtime issues.
            if (warning.code === "CIRCULAR_DEPENDENCY") {
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
            importTrace(),

            cachingPlugin(resolveFileUrlPlugin(), fileCache),
            cachingPlugin(resolveTypescriptMjsCtsPlugin(), fileCache),

            externalsPlugin(context, {
                dtsResolve,
                forTypes: true,
                skipUnlistedWarnings: true,
            }),

            // JSON handling is delegated to @visulima/rollup-plugin-dts: its transform returns
            // "{}" for JSON files and its load hook patches the generated .d.ts with the correct
            // exports shape (see generate.ts). Running @rollup/plugin-json here would duplicate
            // work that gets discarded in emitDtsOnly mode.

            // Prevent rollup from loading non-source files (e.g. raw data, images, styles)
            // imported from TS during the DTS build — the DTS plugin short-circuits everything
            // through its transform hook, but load runs first and needs a stub for other ids.
            <Plugin>{
                load(id) {
                    if (!SCRIPT_OR_JSON_EXTENSION_REGEX.test(id)) {
                        return "";
                    }

                    return undefined;
                },
                name: "packem:ignore-files",
            },

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

            ...await memoizeDtsPluginByKey(uniqueProcessId)(context, dtsResolve),

            context.options.emitCJS && fixDtsDefaultCjsExportsPlugin(),

            context.options.cjsInterop
            && context.options.emitCJS
            && cjsInteropPlugin({
                ...context.options.rollup.cjsInterop,
                logger: getLogger(context),
            }),

            context.options.rollup.patchTypes && cachingPlugin(patchTypescriptTypesPlugin(context.options.rollup.patchTypes, getLogger(context)), fileCache),

            removeShebangPlugin(),

            ...postPlugins,

            // See the dependencies-license block above: `license` is
            // `LicenseOptions | false`, so narrow off `false` before the
            // optional chain to keep the property reads well-typed.
            context.options.rollup.license !== false
            && context.options.rollup.license?.path
            && typeof context.options.rollup.license.dtsTemplate === "function"
            && licensePlugin({
                licenseFilePath: context.options.rollup.license.path,
                licenseTemplate: context.options.rollup.license.dtsTemplate,
                logger: getLogger(context),
                marker: context.options.rollup.license.dtsMarker ?? "TYPE_DEPENDENCIES",
                mode: "types",
                packageName: context.pkg.name,
            }),
        ].filter(Boolean),
    };
};
