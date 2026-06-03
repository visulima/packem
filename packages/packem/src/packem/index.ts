/* eslint-disable no-secrets/no-secrets */
import process from "node:process";

import { bold, cyan } from "@visulima/colorize";
import { findCacheDirSync } from "@visulima/find-cache-dir";
import { ensureDirSync } from "@visulima/fs";
import { duration } from "@visulima/humanizer";
import type { NormalizedPackageJson, PackageJson } from "@visulima/package";
import { hasPackageJsonAnyDependency } from "@visulima/package";
import { patchErrorWithTrace } from "@visulima/packem-rollup";
import { enhanceRollupError, FileCache } from "@visulima/packem-share";
import { ALLOWED_TRANSFORM_EXTENSIONS_REGEX, DEFAULT_EXTENSIONS, EXCLUDE_REGEXP, PRODUCTION_ENV } from "@visulima/packem-share/constants";
import type { BuildContext, BuildHooks } from "@visulima/packem-share/types";
import { getCacheHash } from "@visulima/packem-share/utils";
import { join, resolve } from "@visulima/path";
import type { TsConfigJson, TsConfigResult } from "@visulima/tsconfig";
import browserslist from "browserslist";
import { createHooks } from "hookable";
import { createJiti } from "jiti";
import type { RollupError } from "rollup";
import type { Result as ExecChild } from "tinyexec";
import { exec } from "tinyexec";

import { version as packemVersion } from "../../package.json";
import { resolveBundlerName } from "../bundler/build";
import { ensureBundlerInstalled, ensureTransformerInstalled } from "../bundler/ensure-installed";
import autoPreset from "../config/preset/auto";
import loadPackageJson from "../config/utils/load-package-json";
import loadTsconfig from "../config/utils/load-tsconfig";
import prepareEntries from "../config/utils/prepare-entries";
import createStub from "../jit/create-stub";
import rollupWatch from "../rollup/watch";
import type { BuildConfig, BuildOptions, Environment, InternalBuildOptions, Mode } from "../types";
import cleanDistributionDirectories from "../utils/clean-distribution-directories";
import { createDefuWithHooksMerger } from "../utils/create-defu-with-hooks-merger";
import createOrUpdateKeyStorage from "../utils/create-or-update-key-storage";
import getPackageSideEffect from "../utils/get-package-side-effect";
import killProcess from "../utils/kill-process";
import logBuildErrors from "../utils/log-build-errors";
import removeOldCacheFolders from "../utils/remove-old-cache-folders";
import warnLegacyCJS from "../utils/warn-legacy-cjs";
import attw from "../validator/attw";
import packageJsonValidator from "../validator/package-json";
import validateAliasEntries from "../validator/validate-alias-entries";
import validateBundleSize from "../validator/validate-bundle-size";
import build from "./build";
import { node10Compatibility } from "./node10-compatibility";

/**
 * The `@visulima/pail` logger surface, sourced from `BuildContext`.
 * @internal
 */
type Logger = BuildContext<InternalBuildOptions>["logger"];

// type-fest@0.20.2 (resolved transitively by @visulima/tsconfig) predates these
// CompilerOptions fields — read them through this alias so the source compiles
// without per-access casts.
type CompilerOptionsExtras = {
    allowImportingTsExtensions?: boolean;
    jsxFragmentFactory?: string;
    jsxImportSource?: string;
};

const extras = (compilerOptions: TsConfigJson["compilerOptions"] | undefined): CompilerOptionsExtras => compilerOptions ?? {};

/**
 * Matches raw-loadable asset extensions (markdown, text, html, generic data).
 * Hoisted to module scope so it is compiled once instead of on every call.
 * @internal
 */
const RAW_ASSET_EXTENSION_REGEX = /\.(md|txt|htm|html|data)$/;

/**
 * Resolves TSConfig JSX option to a standardized JSX runtime value.
 * @param jsx The JSX option from TSConfig
 * @returns Standardized JSX runtime value ('automatic', 'preserve', or 'transform')
 * @internal
 */
const resolveTsconfigJsxToJsxRuntime = (jsx?: string): "automatic" | "preserve" | "transform" | undefined => {
    switch (jsx) {
        case "preserve":
        case "react-native": {
            return "preserve";
        }
        case "react": {
            return "transform";
        }
        case "react-jsx":
        case "react-jsxdev": {
            return "automatic";
        }
        default: {
            return undefined;
        }
    }
};

/**
 * Generates build options by combining and processing various configuration sources.
 * @param logger Logger instance for output
 * @param rootDirectory Root directory of the project
 * @param environment Build environment (development/production)
 * @param debug Enable debug mode
 * @param buildConfig Resolved build configuration
 * @param packageJson Package.json contents
 * @param tsconfig TypeScript configuration
 * @param runtimeVersion Node.js runtime version
 * @returns Processed internal build options
 * @internal
 */
const generateOptions = (
    logger: Logger,
    rootDirectory: string,
    environment: Environment,
    debug: boolean,
    buildConfig: BuildConfig,
    packageJson: PackageJson,
    tsconfig: TsConfigResult | undefined,
    runtimeVersion: string,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): InternalBuildOptions => {
    const jsxRuntime = resolveTsconfigJsxToJsxRuntime(tsconfig?.config.compilerOptions?.jsx);
    const splitRuntimeVersion = runtimeVersion.split(".");

    // Use custom defu that merges hooks instead of overwriting them
    const customDefu = createDefuWithHooksMerger();

    // @ts-ignore TS2589 is just deeply nested and this is needed for typedoc
    const options = customDefu(autoPreset, buildConfig, <Partial<BuildOptions>>{
        alias: {},
        browserTargets: browserslist(),
        cjsInterop: false,
        clean: true,
        debug,
        declaration: undefined,
        emitCJS: undefined,
        emitESM: undefined,
        entries: [],
        externals: [],
        failOnWarn: true,
        fileCache: true,
        // @see https://github.com/unjs/jiti#%EF%B8%8F-options
        jiti: {
            alias: {},
            debug,
            interopDefault: true,
        },
        minify: environment === PRODUCTION_ENV,
        name: (packageJson.name ?? "").split("/").pop() ?? "default",
        outDir: tsconfig?.config.compilerOptions?.outDir ?? "dist",
        rollup: {
            alias: {},
            cjsInterop: { addDefaultProperty: false },
            commonjs: {
                extensions: [".mjs", ".js", ".json", ".node", ".cjs"],
                ignoreTryCatch: true,
                preserveSymlinks: true,
                // Deal with mixed ESM and CJS modules, such as calling require() in ESM.
                // For relative paths, the module will be bundled;
                // For external libraries, the module will not be bundled.
                // https://github.com/rollup/plugins/tree/master/packages/commonjs#transformmixedesmodules
                transformMixedEsModules: true,
            },
            css: {
                autoModules: true,
                extensions: [".css", ".pcss", ".postcss", ".sss"],
                namedExports: true,
            },
            dataUri: {
                srcset: true,
            },
            debarrel: {},
            detectDuplicated: {},
            dts: {
                compilerOptions: {
                    // `baseUrl` is deprecated in TS tooling but still a valid emit input we
                    // must forward from the user's tsconfig for path-base resolution.
                    // eslint-disable-next-line sonarjs/deprecation -- intentional pass-through of a still-functional tsconfig field
                    baseUrl: tsconfig?.config.compilerOptions?.baseUrl ?? ".",
                    // Avoid extra work
                    checkJs: false,
                    // Disable composite to avoid requiring all files via `include`
                    composite: false,
                    // Ensure ".d.ts" modules are generated
                    declaration: true,
                    declarationMap: false,
                    emitDeclarationOnly: true,
                    // Handled via plugin-level `incremental` option instead
                    incremental: false,
                    moduleResolution: 100, // Bundler,
                    // Skip ".js" generation
                    noEmit: false,
                    // Skip code generation when error occurs
                    noEmitOnError: true,
                    preserveSymlinks: false,
                    skipLibCheck: true,
                    // Ensure we can parse the latest code
                    target: 99, // ESNext
                },
            },
            dynamicVars: {
                errorWhenNoFilesFound: true,
                exclude: EXCLUDE_REGEXP,
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
            },
            esbuild: {
                charset: "utf8",
                jsx: jsxRuntime,
                jsxDev: (tsconfig?.config.compilerOptions?.jsx as string | undefined) === "react-jsxdev",
                jsxFactory: tsconfig?.config.compilerOptions?.jsxFactory,
                jsxFragment: extras(tsconfig?.config.compilerOptions).jsxFragmentFactory,
                jsxImportSource: extras(tsconfig?.config.compilerOptions).jsxImportSource,
                jsxSideEffects: true,

                /**
                 * esbuild renames variables even if minification is not enabled
                 * https://esbuild.github.io/try/#dAAwLjE5LjUAAGNvbnN0IGEgPSAxOwooZnVuY3Rpb24gYSgpIHt9KTs
                 */
                keepNames: true,

                /**
                 * Improve performance by generating smaller source maps
                 * that doesn't include the original source code
                 *
                 * https://esbuild.github.io/api/#sources-content
                 */
                sourcesContent: false,

                supported: {
                    "import-attributes": true,
                },
                target: tsconfig?.config.compilerOptions?.target,
                treeShaking: true,
                // Optionally preserve symbol names during minification
                tsconfigRaw: tsconfig?.config,
            },
            json: {
                preferConst: false,
            },
            license: {
                dependenciesTemplate: (licenses: string[], dependencyLicenseTexts: string, pName: string) =>
                    `\n# Licenses of bundled dependencies\n`
                    + `The published ${pName} artifact additionally contains code with the following licenses:\n${
                        licenses.length > 0 ? `${licenses.join(", ")}\n\n` : "\n"
                    }# Bundled dependencies:\n${dependencyLicenseTexts}`,
                dtsTemplate: (licenses: string[], dependencyLicenseTexts: string, pName: string) =>
                    `\n# Licenses of bundled types\n`
                    + `The published ${pName} artifact additionally contains code with the following licenses:\n${
                        licenses.length > 0 ? `${licenses.join(", ")}\n\n` : "\n"
                    }# Bundled types:\n${dependencyLicenseTexts}`,
            },
            nativeModules: {},
            node10Compatibility: false,
            output: {
                importAttributesKey: Number(splitRuntimeVersion[0]) >= 22 ? "with" : "assert",
            },
            oxc: {
                jsx:
                    jsxRuntime === "preserve"
                        ? "preserve"
                        : {
                            development: environment !== "production",
                            pragma: tsconfig?.config.compilerOptions?.jsxFactory,
                            pragmaFrag: extras(tsconfig?.config.compilerOptions).jsxFragmentFactory,
                            pure: true,
                            runtime: jsxRuntime === "transform" || jsxRuntime === "automatic" ? "automatic" : "classic",
                            useBuiltIns: true,
                            useSpread: true,
                        },
            },
            patchTypes: {},
            polyfillNode: {},
            preserveDirectives: {
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
            },
            preserveDynamicImports: true,
            pure: {},
            raw: {
                exclude: EXCLUDE_REGEXP,
                include: [RAW_ASSET_EXTENSION_REGEX],
            },
            replace: {
                /**
                 * Seems this currently doesn't work:
                 * https://github.com/rollup/plugins/pull/1084#discussion_r861447543
                 */
                objectGuards: true,
                preventAssignment: true,
            },
            /**
             * Options for the oxc-resolver-backed module resolution plugin.
             *
             * Some defaults are adapted from:
             * https://github.com/import-js/eslint-import-resolver-typescript/blob/master/src/index.ts
             * https://github.com/rolldown/rolldown/blob/main/crates/rolldown_resolver/src/resolver.rs
             *
             * Legacy `@rollup/plugin-node-resolve` keys (`exportConditions`,
             * `browser`) are still accepted here and mapped onto the oxc options
             * at build time (see `mergeNodeResolveIntoOxc`).
             */
            resolve: {
                aliasFields: [["browser"]],
                // Following option must be *false* for polyfill to work.
                builtinModules: false,
                // RUNTIME conditions only. "types"/"typings" must NOT appear here:
                // oxc-resolver honours the order packages declare in their `exports`
                // map, and many packages list `"types"` before `"import"`. Including
                // it would resolve a runtime import to a `.d.ts` file, which rollup
                // then tries to parse as JavaScript and fails. DTS resolution is
                // handled separately by @visulima/rollup-plugin-dts.
                conditionNames: [
                    environment ?? "production",
                    "default",

                    "import",
                    "require",
                    "module-sync",

                    "node",
                    "node-addons",
                    "browser",

                    // APF: https://angular.io/guide/angular-package-format
                    "esm2020",
                    "es2020",
                    "es2015",
                ],
                // NO `extensionAlias` here. The `.js`→`.ts`/`.tsx` (and `.mjs`→`.mts`,
                // `.cjs`→`.cts`) rewriting is handled by the dedicated
                // `resolveTypescriptMjsCts` plugin, which is context-aware: it tries TS
                // extensions first for *source* relative imports, but `.js` first for
                // bare specifiers and node_modules imports (matching node-resolve /
                // esbuild). A static, always-TS-first `extensionAlias` here would
                // hijack that plugin's "try .js first" probe and resolve a
                // node_modules `./file.js` to a stray co-located `.ts`.
                // `.js`-first ordering (DEFAULT_EXTENSIONS) so a bare/`node_modules`
                // specifier prefers the published `.js` over a co-located `.ts`
                // (matches node-resolve / esbuild behavior). `.d.ts` is present but
                // never wins for runtime resolution because the runtime extensions
                // precede it and the conditionNames/mainFields above carry no
                // "types" entry — see the note there.
                extensions: DEFAULT_EXTENSIONS,
                mainFields: [
                    // APF: https://angular.io/guide/angular-package-format
                    "fesm2020",
                    "fesm2015",
                    "esm2020",
                    "es2020",

                    "module",
                    "main",
                    "browser",
                    "jsnext:main",
                ],
            },
            resolveExternals: {
                builtins: true,
                builtinsPrefix: "add",
                deps: true,
                devDeps: false,
                exclude: [],
                optDeps: true,
                peerDeps: true,
            },
            shebang: {
                replace: false,
                shebang: "#!/usr/bin/env node",
            },
            shim: {
                exclude: EXCLUDE_REGEXP,
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
            },
            sourcemap: {},
            sucrase: {
                disableESTransforms: true,
                enableLegacyBabel5ModuleInterop: false,
                enableLegacyTypeScriptModuleInterop: !tsconfig?.config.compilerOptions?.esModuleInterop,
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
                injectCreateRequireForImportRequire: false,
                preserveDynamicImport: true,
                production: environment === PRODUCTION_ENV,
                // Sucrase feeds rollup, which requires ESM input. The "imports" transform
                // rewrites ESM to CJS require() and breaks rollup's static module graph.
                ...tsconfig?.config.compilerOptions?.jsx && ["react", "react-jsx", "react-jsxdev"].includes(tsconfig.config.compilerOptions.jsx as string)
                    ? {
                        jsxFragmentPragma: extras(tsconfig.config.compilerOptions).jsxFragmentFactory,
                        jsxImportSource: extras(tsconfig.config.compilerOptions).jsxImportSource,
                        jsxPragma: tsconfig.config.compilerOptions.jsxFactory,
                        jsxRuntime,
                        transforms: ["typescript", "jsx"],
                    }
                    : {
                        transforms: ["typescript"],
                    },
            },
            swc: {
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
                inlineSourcesContent: false,
                inputSourceMap: false,
                isModule: true,
                jsc: {
                    experimental: {
                        keepImportAttributes: true,
                    },
                    externalHelpers: true,
                    keepClassNames: true,
                    loose: true, // Use loose mode
                    parser: {
                        decorators: tsconfig?.config.compilerOptions?.experimentalDecorators,
                        syntax: tsconfig ? "typescript" : "ecmascript",
                        [tsconfig ? "tsx" : "jsx"]: true,
                    },
                    target: tsconfig?.config.compilerOptions?.target?.toLowerCase(),
                    transform: {
                        decoratorMetadata: tsconfig?.config.compilerOptions?.emitDecoratorMetadata,
                        decoratorVersion: "2022-03",
                        legacyDecorator: tsconfig?.config.compilerOptions?.experimentalDecorators,
                        react: {
                            development: environment !== PRODUCTION_ENV,
                            pragma: tsconfig?.config.compilerOptions?.jsxFactory,
                            pragmaFrag: extras(tsconfig?.config.compilerOptions).jsxFragmentFactory,
                            runtime: jsxRuntime,
                            throwIfNamespace: true,
                        },
                        treatConstEnumAsEnum: tsconfig?.config.compilerOptions?.preserveConstEnums,
                        useDefineForClassFields: tsconfig?.config.compilerOptions?.useDefineForClassFields,
                    },
                },
                module: {
                    ignoreDynamic: true,
                    importInterop: "none",
                    preserveImportMeta: true,
                    strict: false, // no __esModule
                    strictMode: false, // no 'use strict';
                    type: "es6",
                },
            },
            treeshake: {
                moduleSideEffects: getPackageSideEffect(rootDirectory, packageJson),
                preset: "recommended",
                propertyReadSideEffects: true,
            },
            tsconfigPaths: {
                // Default is false to avoid performance issues
                resolveAbsolutePath: false,
            },
            url: {
                emitFiles: true,
                fileName: "[hash][extname]",
                include: ["**/*.svg", "**/*.png", "**/*.jp(e)?g", "**/*.gif", "**/*.webp"],
                limit: 14 * 1024,
            },
            visualizer: {},
            watch: {
                chokidar: {
                    ignoreInitial: true,
                    ignorePermissionErrors: true,
                },
                clearScreen: true,
                exclude: EXCLUDE_REGEXP,
            },
        },
        rootDir: rootDirectory,
        sourceDir: "src",
        sourcemap: false,
        transformerName: undefined,
        typedoc: {
            excludePrivate: true,
            format: "inline",
            githubPages: false,
            // Sorts the main index for a namespace / module; not the sidebar tab.
            groupOrder: [
                "Classes",
                "Constructors",
                "Accessors",
                "Methods",
                "Functions",
                "Namespaces",
                "Variables",
                "Enumerations",
                "Interfaces",
                "Type Aliases",
                "*",
            ],
            // Sorts the navigation sidebar order for symbol types.
            kindSortOrder: [
                "Project",
                "Module",
                "Class",
                "Interface",
                "Function",
                "Namespace",
                "Variable",
                "Enum",
                "EnumMember",
                "TypeAlias",
                "Reference",
                "Constructor",
                "Property",
                "Accessor",
                "Method",
                "Parameter",
                "TypeParameter",
                "TypeLiteral",
                "CallSignature",
                "ConstructorSignature",
                "IndexSignature",
                "GetSignature",
                "SetSignature",
            ],
            marker: "TYPEDOC",
            name: packageJson.name ?? "unknown",
            pretty: true,
            readme: "none",
            showConfig: debug,
            tsconfig: tsconfig?.path,
        },
        validation: {
            dependencies: {
                hoisted: {
                    exclude: [],
                },
                unused: {
                    exclude: [],
                },
            },
            packageJson: {
                bin: true,
                dependencies: true,
                exports: true,
                files: true,
                main: true,
                module: true,
                name: true,
                types: true,
                typesVersions: true,
            },
        },
    }) as InternalBuildOptions;

    if (options.runtime === undefined) {
        logger.warn(
            "No runtime specified, defaulting to 'node'. This will change in packem v2 to 'browser', please add 'runtime: node' to your packem config or command call",
        );

        options.runtime = "node";
    }

    const dependencies = new Map([...Object.entries(packageJson.dependencies ?? {}), ...Object.entries(packageJson.devDependencies ?? {})]);

    const isRolldown = options.bundler === "rolldown";

    // Rolldown ships its own oxc-based transform and never invokes packem's
    // transformer adapter plugin. Setting `transformer` together with
    // `bundler: "rolldown"` is a configuration mistake — refuse to build rather
    // than silently ignoring the option.
    if (isRolldown && buildConfig.transformer !== undefined) {
        throw new Error(
            "The `transformer` option is not supported when `bundler: \"rolldown\"`. "
            + "Rolldown uses its own oxc-based transform — remove `transformer` from your packem config.",
        );
    }

    if (!isRolldown) {
        if (options.transformer?.NAME === undefined) {
            throw new Error("Unknown transformer, check your transformer options or install one of the supported transformers: esbuild, swc, sucrase");
        }

        options.transformerName = options.transformer.NAME;

        // SWC's `externalHelpers: true` emits imports from `@swc/helpers`. That
        // package is a runtime helper dependency meant to be resolved by the
        // consumer, not bundled — keep it external so the helpers aren't
        // duplicated into every chunk that uses them. (node-resolve happened to
        // leave it external by failing to resolve the subpaths; the oxc resolver
        // resolves them, so we must externalize it explicitly.)
        if (options.transformerName === "swc") {
            options.externals = [...options.externals, /^@swc\/helpers(?:\/.*)?$/];
        }
    }

    logger.info({
        message: `Using ${cyan("node ")}${runtimeVersion}`,
        prefix: "system",
    });
    logger.info({
        message: isRolldown
            ? `Using ${cyan("rolldown")} with ${cyan(options.runtime as string)} build runtime`
            : `Using ${cyan("rollup")} with ${cyan(options.runtime as string)} build runtime`,
        prefix: "bundler",
    });

    if (!isRolldown && options.transformerName) {
        let dependencyName: string = options.transformerName;

        if (options.transformerName === "oxc") {
            dependencyName = "oxc-transform";
        } else if (options.transformerName === "swc") {
            dependencyName = "@swc/core";
        }

        const version = dependencies.get(dependencyName) ?? "0.0.0";

        logger.info({
            message: `Using ${cyan(options.transformerName)} ${version}`,
            prefix: "transformer",
        });
    }

    if (options.rollup.resolve) {
        options.rollup.resolve.preferBuiltins = options.runtime === "node";

        if (options.rollup.resolve.preferBuiltins) {
            options.rollup.polyfillNode = false;

            logger.debug("Disabling polyfillNode because preferBuiltins is set to true");
        }
    }

    if (options.runtime === "node") {
        options.browserTargets = [];
    }

    if (options.runtime === "browser") {
        if (options.rollup.resolve && options.rollup.resolve.browser === undefined) {
            options.rollup.resolve.browser = true;
        }

        if (options.browserTargets && options.browserTargets.length > 0) {
            logger.debug(`Using browser targets: ${options.browserTargets.join(", ")}`);
        }
    }

    validateAliasEntries(options.alias);

    // `options.rollup.alias` is `RollupAliasOptions | false`; optional chaining
    // only short-circuits on null/undefined, so `alias === false` would fall
    // through to a `false.entries` access (an error type). Narrow off `false`
    // explicitly before reading `.entries`.
    if (options.rollup.alias !== false && options.rollup.alias?.entries) {
        validateAliasEntries(options.rollup.alias.entries);
    }

    if (options.outputExtensionMap) {
        let temporaryValue: string | undefined;

        for (const [key, value] of Object.entries(options.outputExtensionMap)) {
            if (!["cjs", "esm"].includes(key)) {
                throw new Error(`Invalid output extension map: ${key} must be "cjs" or "esm"`);
            }

            if (typeof value !== "string") {
                throw new TypeError(`Invalid output extension map: ${key} must be a string`);
            }

            if (value.startsWith(".")) {
                throw new Error(`Invalid output extension map: ${key} must not start with a dot. Example: "cjs": "c.js", "esm": "m.js"`);
            }

            if (temporaryValue === undefined) {
                temporaryValue = value;
            } else if (temporaryValue === value) {
                throw new Error(`Invalid output extension map: ${key} must be different from the other key`);
            }
        }
    }

    if (tsconfig?.config.compilerOptions?.declarationMap) {
        options.sourcemap = true;

        logger.info("Enabling sourcemap because declarationMap is enabled in tsconfig.json");
    }

    return options;
};

/**
 * Creates a build context with all necessary configuration and environment information.
 * @param logger Logger instance for output
 * @param rootDirectory Root directory of the project
 * @param mode Build mode (build/watch)
 * @param environment Build environment (development/production)
 * @param debug Enable debug mode
 * @param buildConfig Resolved build configuration
 * @param packageJson Package.json contents
 * @param tsconfig TypeScript configuration
 * @param nodeVersion Node.js version
 * @returns Promise resolving to the build context
 * @internal
 */
const createContext = async (
    logger: Logger,
    rootDirectory: string,
    mode: Mode,
    environment: Environment,
    debug: boolean,
    buildConfig: BuildConfig,
    packageJson: PackageJson,
    tsconfig: TsConfigResult | undefined,
    nodeVersion: string,
): Promise<BuildContext<InternalBuildOptions>> => {
    // Preserve hooks from buildConfig before generateOptions (which returns InternalBuildOptions without hooks)
    // generateOptions merges hooks correctly but doesn't return them since they're not part of BuildOptions
    const mergedHooks = buildConfig.hooks;

    const options = generateOptions(logger, rootDirectory, environment, debug, buildConfig, packageJson, tsconfig, nodeVersion);

    ensureDirSync(join(options.rootDir, options.outDir));

    // Build context
    const context: BuildContext<InternalBuildOptions> = {
        buildEntries: [],
        dependencyGraphMap: new Map<string, Set<[string, string]>>(),
        environment,
        hoistedDependencies: new Set(),
        // `createHooks` is generic over the hook map; typing it against the
        // shared `BuildHooks` contract makes it structurally match
        // `BuildContext.hooks` without an `any` escape.
        hooks: createHooks<BuildHooks<InternalBuildOptions>>(),
        implicitDependencies: new Set(),
        // Create shared jiti instance for context
        jiti: createJiti(options.rootDir, options.jiti),
        logger,
        mode,
        options,
        pkg: packageJson,
        tsconfig,
        usedDependencies: new Set(),
        warnings: new Set(),
    };

    if (mergedHooks) {
        context.hooks.addHooks(mergedHooks);
    }

    // Allow to prepare and extending context
    await context.hooks.callHook("build:prepare", context);

    if (context.options.emitESM === undefined) {
        logger.info("Emitting of ESM bundles, is disabled.");
    }

    if (context.options.emitCJS === undefined) {
        logger.info("Emitting of CJS bundles, is disabled.");
    }

    if (context.options.minify) {
        logger.info("Minification is enabled, the output will be minified");
    }

    warnLegacyCJS(context);

    const hasTypescript = hasPackageJsonAnyDependency(packageJson as NormalizedPackageJson, ["typescript"]);

    if (context.options.declaration && context.tsconfig === undefined && hasTypescript) {
        throw new Error("Cannot build declaration files without a tsconfig.json");
    }

    if (!hasTypescript) {
        context.options.declaration = false;

        logger.info({
            message: "Typescript is not installed. Generation of declaration files are disabled.",
            prefix: "dts",
        });
    } else if (context.options.declaration === false) {
        logger.info({
            message: "Generation of declaration files are disabled.",
            prefix: "dts",
        });
    }

    if (context.options.declaration) {
        logger.info(`Using typescript version: ${cyan(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript ?? "unknown")}`);
    }

    if (
        context.options.declaration
        && (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript)
        && !context.tsconfig?.config.compilerOptions?.isolatedModules
    ) {
        logger.warn(
            `'compilerOptions.isolatedModules' is not enabled in tsconfig.\nBecause none of the third-party transpiler, packem uses under the hood is type-aware, some techniques or features often used in TypeScript are not properly checked and can cause mis-compilation or even runtime errors.\nTo mitigate this, you should set the isolatedModules option to true in tsconfig and let your IDE warn you when such incompatible constructs are used.`,
        );
    }

    prepareEntries(context);

    return context;
};

/**
 * Gets a human-readable string representation of the build mode.
 * @param mode Build mode (build/watch)
 * @returns String representation of the mode
 * @internal
 */
const getMode = (mode: Mode): string => {
    switch (mode) {
        case "build": {
            return "Building";
        }
        case "jit": {
            return "Stubbing";
        }
        case "watch": {
            return "Watching";
        }
        default: {
            // `mode` narrows to `never` here, but untyped JS callers can still
            // pass an out-of-contract value at runtime — keep the guard and
            // stringify explicitly.
            throw new Error(`Unknown mode: ${String(mode)}`);
        }
    }
};

/**
 * Main entry point for the Packem bundler.
 * Handles the complete build process including configuration loading, validation,
 * and execution of the build/watch process.
 * @param rootDirectory Root directory of the project
 * @param mode Build mode (build/watch)
 * @param environment Build environment (development/production)
 * @param logger Logger instance for output
 * @example
 * ```typescript
 * import packem from 'packem';
 *
 * await packem('/path/to/project', 'build', 'production', logger, {
 *   debug: true,
 *   configPath: './packem.config.js'
 * });
 * ```
 * @throws {Error} If configuration validation fails or build process encounters errors
 * @public
 */
const packem = async (
    rootDirectory: string,
    mode: Mode,
    environment: Environment,
    logger: Logger,
    debug: boolean,
    config: BuildConfig,
    tsconfigPath?: string,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<void> => {
    const nodeVersion = process.version.slice(1);

    logger.wrapAll();

    // Determine rootDirectory
    // eslint-disable-next-line no-param-reassign
    rootDirectory = resolve(process.cwd(), rootDirectory);

    logger.debug("Root directory:", rootDirectory);

    const { packageJson, packageJsonPath } = loadPackageJson(rootDirectory);

    logger.debug("Using package.json found at", packageJsonPath);

    const tsconfig = await loadTsconfig(rootDirectory, packageJson, logger, tsconfigPath);

    const cachePath = findCacheDirSync("@visulima/packem", {
        cwd: rootDirectory,
    });

    let logged = false;
    let onSuccessProcess: ExecChild | undefined;
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type,@typescript-eslint/no-explicit-any
    let onSuccessCleanup: (() => any) | undefined | void;
    let signalHandler: (() => void) | undefined;

    const cacheKey
        = getCacheHash(
            JSON.stringify({
                packemVersion,
                version: packageJson.version,
                ...packageJson.dependencies,
                ...packageJson.devDependencies,
                ...packageJson.peerDependencies,
                ...packageJson.peerDependenciesMeta,
                browser: packageJson.browser,
                eNode: packageJson.engines?.node,
                exports: packageJson.exports,
                main: packageJson.main,
                module: packageJson.module,
                nodeVersion,
                type: packageJson.type,
                types: packageJson.types,
            }),
        ) + getCacheHash(JSON.stringify(config));

    if (cachePath) {
        createOrUpdateKeyStorage(cacheKey, cachePath, logger);
    }

    const fileCache = new FileCache(rootDirectory, cachePath, cacheKey, logger);

    try {
        const context = await createContext(logger, rootDirectory, mode, environment, debug, config, packageJson, tsconfig, nodeVersion);

        fileCache.isEnabled = context.options.fileCache ?? true;

        // Ensure the bundler runtime and transformer engine are installed before
        // any build/watch work runs. These prompt-install in interactive
        // terminals and fail loudly in CI with a package-manager-aware hint.
        const requestedBundler = resolveBundlerName(context.options.bundler);

        await ensureBundlerInstalled(requestedBundler, rootDirectory, logger);

        // Rolldown still depends on rollup for DTS until the dts plugin is
        // rolldown-compatible. Pull rollup in so the DTS path doesn't crash.
        if (requestedBundler === "rolldown" && context.options.declaration) {
            await ensureBundlerInstalled("rollup", rootDirectory, logger);
        }

        if (context.options.transformerName) {
            await ensureTransformerInstalled(context.options.transformerName, rootDirectory, logger);
        }

        logger.info(cyan(`${getMode(mode)} ${context.options.name}`));

        logger.debug({
            context: context.options.entries,
            message: `${bold("Root dir:")} ${context.options.rootDir}\n  ${bold("Entries:")}`,
        });

        const runBuilder = async (watchMode?: true) => {
            for (const [name, builder] of Object.entries(context.options.builder ?? {})) {
                logger.raw("\n");

                // Builders run strictly one after another: each mutates the shared
                // `context`/`fileCache` and reports its own duration, so parallelising
                // would corrupt state and timing. The sequential awaits are intentional.
                // eslint-disable-next-line no-await-in-loop -- builders must run sequentially (shared mutable context/cache)
                await context.hooks.callHook("builder:before", name, context);

                const builderStart = Date.now();

                const getBuilderDuration = () => duration(Math.floor(Date.now() - builderStart));

                // eslint-disable-next-line no-await-in-loop -- builders must run sequentially (shared mutable context/cache)
                await builder(context, cachePath, fileCache, logged);

                // eslint-disable-next-line no-await-in-loop -- builders must run sequentially (shared mutable context/cache)
                await context.hooks.callHook("builder:done", name, context);

                logger.raw(`\n⚡️ ${name} run in ${getBuilderDuration()}`);

                if (watchMode) {
                    logger.raw("\n\n");
                }
            }
        };

        const doOnSuccessCleanup = async () => {
            if (onSuccessProcess?.pid !== undefined) {
                await killProcess({
                    pid: onSuccessProcess.pid,
                    signal: config.killSignal ?? "SIGTERM",
                });
            } else if (onSuccessCleanup !== undefined) {
                try {
                    if (typeof onSuccessCleanup === "function") {
                        await (onSuccessCleanup as () => Promise<void>)();
                    }
                } catch (error: unknown) {
                    throw new Error(`onSuccess function cleanup failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
                }
            }

            // reset them in all occasions anyway
            onSuccessProcess = undefined;
            onSuccessCleanup = undefined;
        };

        const runOnsuccess = async () => {
            if (typeof context.options.onSuccess === "function") {
                try {
                    onSuccessCleanup = await context.options.onSuccess();
                } catch (error: unknown) {
                    throw new Error(`onSuccess function failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
                }
            } else if (typeof context.options.onSuccess === "string") {
                const timeout = context.options.onSuccessTimeout ?? 30_000; // 30 seconds default

                // Capture the spawned process locally to avoid race conditions with cleanup
                // eslint-disable-next-line no-multi-assign
                const executedProcess = onSuccessProcess = exec(context.options.onSuccess, [], {
                    nodeOptions: {
                        shell: true,
                        stdio: "inherit",
                        timeout,
                    },
                });

                await executedProcess;

                const { exitCode } = executedProcess;

                if (typeof exitCode === "number" && exitCode !== 0) {
                    throw new Error(`onSuccess script failed with exit code ${String(exitCode)}. Check the output above for details.`);
                }
            }
        };

        const start = Date.now();
        const getDuration = () => duration(Math.floor(Date.now() - start));

        if (mode === "watch") {
            if (context.options.rollup.watch === false) {
                throw new Error("Rollup watch is disabled. You should check your packem config.");
            }

            // Watch is rollup-only today. Surface the fallback so users on
            // `bundler: "rolldown"` know what's actually running until a
            // rolldown watch path lands.
            if (context.options.bundler === "rolldown") {
                logger.warn({
                    message: "Watch mode falls back to rollup; rolldown watch isn't supported yet.",
                    prefix: "bundler",
                });
            }

            await rollupWatch(context, fileCache, runBuilder, runOnsuccess, doOnSuccessCleanup);

            logBuildErrors(context, false);

            return;
        }

        // Clean dist dirs
        await cleanDistributionDirectories(context);

        if (mode === "jit") {
            await createStub(context);

            await context.hooks.callHook("build:done", context);
        } else {
            logged = await build(context, fileCache);

            if (context.options.emitCJS && context.options.declaration === "compatible") {
                if (logged) {
                    logger.raw("\n");
                }

                let outputMode: "console" | "file" = "console";
                let typeScriptVersion: string = "*";

                if (context.options.node10Compatibility) {
                    outputMode = context.options.node10Compatibility.writeToPackageJson ? "file" : "console";
                    typeScriptVersion = context.options.node10Compatibility.typeScriptVersion ?? "*";
                }

                await node10Compatibility(logger, context.options.entries, context.options.outDir, context.options.rootDir, outputMode, typeScriptVersion);
            }

            await context.hooks.callHook("validate:before", context);

            // TODO: Add a validation handler, to add custom validation checks
            if (typeof context.options.validation === "object") {
                if (context.options.validation.packageJson) {
                    // packageJsonValidator is synchronous, run immediately
                    packageJsonValidator(context);
                }

                if (context.options.validation.attw) {
                    await attw(context, logged);
                }

                if (context.options.validation.bundleLimit) {
                    // validateBundleSize is synchronous, run immediately
                    validateBundleSize(context, logged);
                }
            }

            await context.hooks.callHook("validate:done", context);

            logBuildErrors(context, logged);
        }

        logger.raw(`\n⚡️ Build run in ${getDuration()}\n`);

        // Register signal handlers as named refs so we can deregister in
        // finally. Without this, programmatic callers that invoke packem()
        // multiple times leak listeners and trip Node's MaxListenersExceeded.
        signalHandler = () => {
            // Node's signal-listener signature is synchronous `() => void`, so
            // run the async cleanup as a self-contained task and surface any
            // rejection instead of returning a floating promise to the emitter.
            doOnSuccessCleanup().catch((error: unknown) => {
                logger.raw(`\nonSuccess cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
            });
        };

        process.once("SIGINT", signalHandler);
        process.once("SIGTERM", signalHandler);

        await runBuilder();

        await runOnsuccess();
    } catch (error: unknown) {
        logger.raw("\n");

        patchErrorWithTrace(error);
        // `enhanceRollupError` mutates a rollup-shaped error in place and guards
        // internally for non-rollup shapes; the caught value is always an
        // Error-like object thrown from the build pipeline here.
        enhanceRollupError(error as RollupError);

        throw error;
    } finally {
        if (signalHandler) {
            process.off("SIGINT", signalHandler);
            process.off("SIGTERM", signalHandler);
        }

        // Restore all wrapped console methods
        logger.restoreAll();

        await removeOldCacheFolders(cachePath, logger, logged);
    }
};

export default packem;
