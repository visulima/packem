import process from "node:process";

import { bold, cyan } from "@visulima/colorize";
import { findCacheDirSync } from "@visulima/find-cache-dir";
import { ensureDirSync } from "@visulima/fs";
import { duration } from "@visulima/humanizer";
import type { NormalizedPackageJson, PackageJson } from "@visulima/package";
import { hasPackageJsonAnyDependency } from "@visulima/package";
import { enhanceRollupError, FileCache } from "@visulima/packem-share";
import { ALLOWED_TRANSFORM_EXTENSIONS_REGEX, DEFAULT_EXTENSIONS, EXCLUDE_REGEXP, PRODUCTION_ENV } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { getHash } from "@visulima/packem-share/utils";
import type { Pail } from "@visulima/pail";
import { join, resolve } from "@visulima/path";
import type { TsConfigJson, TsConfigResult } from "@visulima/tsconfig";
import browserslist from "browserslist";
import { createHooks } from "hookable";
import { createJiti } from "jiti";
import { VERSION } from "rollup";
import type { Result as ExecChild } from "tinyexec";
import { exec } from "tinyexec";

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
 * Resolves TSConfig JSX option to a standardized JSX runtime value.
 * @param jsx The JSX option from TSConfig
 * @returns Standardized JSX runtime value ('automatic', 'preserve', or 'transform')
 * @internal
 */
const resolveTsconfigJsxToJsxRuntime = (jsx?: TsConfigJson.CompilerOptions.JSX): "automatic" | "preserve" | "transform" | undefined => {
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
 * @param inputConfig User provided build configuration
 * @param buildConfig Resolved build configuration
 * @param preset Build preset configuration
 * @param packageJson Package.json contents
 * @param tsconfig TypeScript configuration
 * @param runtimeVersion Node.js runtime version
 * @returns Processed internal build options
 * @internal
 */
const generateOptions = (
    logger: Pail,
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
            dts: {
                compilerOptions: {
                    baseUrl: tsconfig?.config.compilerOptions?.baseUrl ?? ".",
                    // Avoid extra work
                    checkJs: false,

                    /**
                     * https://github.com/privatenumber/pkgroll/pull/54
                     *
                     * I think this is necessary because TypeScript's composite requires
                     * that all files are passed in via `include`. However, it seems that
                     * rollup-plugin-dts doesn't read or relay the `include` option in tsconfig.
                     *
                     * For now, simply disabling composite does the trick since it doesn't seem
                     * necessary for dts bundling.
                     *
                     * One concern here is that this overwrites the compilerOptions. According to
                     * the rollup-plugin-dts docs, it reads from baseUrl and paths.
                     */
                    composite: false,
                    // Ensure ".d.ts" modules are generated
                    declaration: true,
                    // This plugin doesn't support declaration maps
                    declarationMap: false,
                    emitDeclarationOnly: true,
                    // error TS5074: Option '--incremental' can only be specified using tsconfig, emitting to single
                    // file or when option '--tsBuildInfoFile' is specified.
                    incremental: false,
                    moduleResolution: 100, // Bundler,
                    // Skip ".js" generation
                    noEmit: false,
                    // Skip code generation when error occurs
                    noEmitOnError: true,
                    // https://github.com/Swatinem/rollup-plugin-dts/issues/143
                    preserveSymlinks: false,
                    skipLibCheck: true,
                    // Ensure we can parse the latest code
                    target: 99, // ESNext
                },
                respectExternal: true,
            },
            dynamicVars: {
                errorWhenNoFilesFound: true,
                exclude: EXCLUDE_REGEXP,
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
            },
            esbuild: {
                charset: "utf8",
                jsx: jsxRuntime,
                jsxDev: tsconfig?.config.compilerOptions?.jsx === "react-jsxdev",
                jsxFactory: tsconfig?.config.compilerOptions?.jsxFactory,
                jsxFragment: tsconfig?.config.compilerOptions?.jsxFragmentFactory,
                jsxImportSource: tsconfig?.config.compilerOptions?.jsxImportSource,
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
                target: tsconfig?.config.compilerOptions?.target,
                treeShaking: true,
                // Optionally preserve symbol names during minification
                tsconfigRaw: tsconfig?.config,
            },
            experimental: {
                /**
                 * Some default options copy from
                 * https://github.com/import-js/eslint-import-resolver-typescript/blob/master/src/index.ts
                 * https://github.com/rolldown/rolldown/blob/main/crates/rolldown_resolver/src/resolver.rs
                 */
                resolve: {
                    aliasFields: [["browser"]],
                    // Following option must be *false* for polyfill to work
                    builtinModules: false,
                    conditionNames: [
                        "default",
                        "types",

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
                    extensionAlias: {
                        ".cjs": [".cts", ".d.cts", ".cjs"],
                        ".js": [
                            ".ts",
                            // `.tsx` can also be compiled as `.js`
                            ".tsx",
                            ".d.ts",
                            ".js",
                        ],
                        ".jsx": [".tsx", ".d.ts", ".jsx"],
                        ".mjs": [".mts", ".d.mts", ".mjs"],
                    },
                    extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".json", ".node"],
                    mainFields: [
                        "types",
                        "typings",

                        // APF: https://angular.io/guide/angular-package-format
                        "fesm2020",
                        "fesm2015",
                        "esm2020",
                        "es2020",

                        "main",
                        "module",
                        "browser",
                        "jsnext:main",
                    ],
                },
            },
            // https://github.com/microsoft/TypeScript/issues/58944
            isolatedDeclarations: {
                exclude: EXCLUDE_REGEXP,
                ignoreErrors: false,
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
                importAttributesKey: Number(splitRuntimeVersion[0] as string) >= 22 ? "with" : "assert",
            },
            oxc: {
                jsx:
                    jsxRuntime === "preserve"
                        ? "preserve"
                        : {
                            development: environment !== "production",
                            pragma: tsconfig?.config.compilerOptions?.jsxFactory,
                            pragmaFrag: tsconfig?.config.compilerOptions?.jsxFragmentFactory,
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
                include: [/\.(md|txt|htm|html|data)$/],
            },
            replace: {
                /**
                 * Seems this currently doesn't work:
                 * https://github.com/rollup/plugins/pull/1084#discussion_r861447543
                 */
                objectGuards: true,
                preventAssignment: true,
            },
            resolve: {
                // old behavior node 14 and removed in node 17
                allowExportsFolderMapping: false,
                // @see https://github.com/rollup/plugins/pull/1823 why we need to set the correct condition
                exportConditions: [environment ?? "production", "module-sync"],
                extensions: DEFAULT_EXTENSIONS,
                // Following option must be *false* for polyfill to work
                preferBuiltins: false,
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
                enableLegacyTypeScriptModuleInterop: tsconfig?.config.compilerOptions?.esModuleInterop === false,
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
                injectCreateRequireForImportRequire: false,
                preserveDynamicImport: true,
                production: environment === PRODUCTION_ENV,
                ...tsconfig?.config.compilerOptions?.jsx && ["react", "react-jsx", "react-jsxdev"].includes(tsconfig.config.compilerOptions.jsx)
                    ? {
                        jsxFragmentPragma: tsconfig.config.compilerOptions.jsxFragmentFactory,
                        jsxImportSource: tsconfig.config.compilerOptions.jsxImportSource,
                        jsxPragma: tsconfig.config.compilerOptions.jsxFactory,
                        jsxRuntime,
                        transforms: ["typescript", "jsx", ...tsconfig.config.compilerOptions.esModuleInterop ? ["imports"] : []],
                    }
                    : {
                        transforms: ["typescript", ...tsconfig?.config.compilerOptions?.esModuleInterop ? ["imports"] : []],
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
                            pragmaFrag: tsconfig?.config.compilerOptions?.jsxFragmentFactory,
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

    if (options.transformer?.NAME === undefined) {
        throw new Error("Unknown transformer, check your transformer options or install one of the supported transformers: esbuild, swc, sucrase");
    }

    options.transformerName = options.transformer.NAME;

    let dependencyName: string = options.transformerName;

    if (options.transformerName === "oxc") {
        dependencyName = "oxc-transform";
    } else if (options.transformerName === "swc") {
        dependencyName = "@swc/core";
    }

    const version = dependencies.get(dependencyName) ?? "0.0.0";

    logger.info({
        message: `Using ${cyan("node ")}${runtimeVersion}`,
        prefix: "system",
    });
    logger.info({
        message: `Using ${cyan("rollup ")}${VERSION} with ${cyan(options.runtime as string)} build runtime`,
        prefix: "bundler",
    });
    logger.info({
        message: `Using ${cyan(options.transformerName)} ${version}`,
        prefix: "transformer",
    });

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

    if (options.rollup.alias && options.rollup.alias.entries) {
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

    if (tsconfig?.config.compilerOptions?.declarationMap === true) {
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
    logger: Pail,
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
        hooks: createHooks<InternalBuildOptions>(),
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
        // #region agent log
        const hooksBefore = (context.hooks as any)._hooks?.get?.("rollup:options");
        const hooksCountBefore = hooksBefore ? hooksBefore.size : 0;

        fetch("http://127.0.0.1:7242/ingest/e5ffe05e-4121-4b48-a3e5-edf81dc8035e", {
            body: JSON.stringify({
                data: { hasRollupOptionsHook: !!mergedHooks?.["rollup:options"], hooksCountBefore, hooksKeys: Object.keys(mergedHooks || {}) },
                hypothesisId: "B",
                location: "index.ts:677",
                message: "Before addHooks",
                runId: "run1",
                sessionId: "debug-session",
                timestamp: Date.now(),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        }).catch(() => {});
        // #endregion
        context.hooks.addHooks(mergedHooks);
        // #region agent log
        const hooksAfter = (context.hooks as any)._hooks?.get?.("rollup:options");
        const hooksCountAfter = hooksAfter ? hooksAfter.size : 0;

        fetch("http://127.0.0.1:7242/ingest/e5ffe05e-4121-4b48-a3e5-edf81dc8035e", {
            body: JSON.stringify({
                data: { hooksAdded: hooksCountAfter - hooksCountBefore, hooksCountAfter, hooksCountBefore },
                hypothesisId: "B",
                location: "index.ts:683",
                message: "After addHooks",
                runId: "run1",
                sessionId: "debug-session",
                timestamp: Date.now(),
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        }).catch(() => {});
        // #endregion
    }

    // Allow to prepare and extending context
    await context.hooks.callHook("build:prepare", context);

    if (context.options.emitESM === undefined) {
        context.logger.info("Emitting of ESM bundles, is disabled.");
    }

    if (context.options.emitCJS === undefined) {
        context.logger.info("Emitting of CJS bundles, is disabled.");
    }

    if (context.options.minify) {
        context.logger.info("Minification is enabled, the output will be minified");
    }

    if (context.options.json && context.options.minify && context.options.json.preferConst === undefined) {
        context.options.json = {
            ...context.options.json,
            preferConst: false,
        };
    }

    warnLegacyCJS(context);

    const hasTypescript = hasPackageJsonAnyDependency(packageJson as NormalizedPackageJson, ["typescript"]);

    if (context.options.declaration && context.tsconfig === undefined && hasTypescript) {
        throw new Error("Cannot build declaration files without a tsconfig.json");
    }

    if (!hasTypescript) {
        context.options.declaration = false;

        context.logger.info({
            message: "Typescript is not installed. Generation of declaration files are disabled.",
            prefix: "dts",
        });
    } else if (context.options.declaration === false) {
        context.logger.info({
            message: "Generation of declaration files are disabled.",
            prefix: "dts",
        });
    }

    if (context.options.declaration) {
        context.logger.info(`Using typescript version: ${cyan(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript ?? "unknown")}`);
    }

    if (
        context.options.declaration
        && (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript)
        && !context.tsconfig?.config.compilerOptions?.isolatedModules
    ) {
        context.logger.warn(
            `'compilerOptions.isolatedModules' is not enabled in tsconfig.\nBecause none of the third-party transpiler, packem uses under the hood is type-aware, some techniques or features often used in TypeScript are not properly checked and can cause mis-compilation or even runtime errors.\nTo mitigate this, you should set the isolatedModules option to true in tsconfig and let your IDE warn you when such incompatible constructs are used.`,
        );
    }

    await prepareEntries(context);

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
            throw new Error(`Unknown mode: ${mode}`);
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
 * @param inputConfig User provided build configuration and options
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
    logger: Pail,
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

    const cacheKey
        = getHash(
            JSON.stringify({
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
        ) + getHash(JSON.stringify(config));

    if (cachePath) {
        createOrUpdateKeyStorage(cacheKey, cachePath as string, logger);
    }

    const fileCache = new FileCache(rootDirectory, cachePath, cacheKey, logger);

    try {
        const context = await createContext(logger, rootDirectory, mode, environment, debug, config, packageJson, tsconfig, nodeVersion);

        fileCache.isEnabled = context.options.fileCache as boolean;

        context.logger.info(cyan(`${getMode(mode)} ${context.options.name}`));

        context.logger.debug({
            context: context.options.entries,
            message: `${bold("Root dir:")} ${context.options.rootDir}\n  ${bold("Entries:")}`,
        });

        const runBuilder = async (watchMode?: true) => {
            for await (const [name, builder] of Object.entries(context.options.builder ?? {})) {
                context.logger.raw("\n");

                await context.hooks.callHook("builder:before", name, context);

                const builderStart = Date.now();

                const getBuilderDuration = () => duration(Math.floor(Date.now() - builderStart));

                await builder(context, cachePath, fileCache, logged);

                await context.hooks.callHook("builder:done", name, context);

                context.logger.raw(`\n⚡️ ${name} run in ${getBuilderDuration()}`);

                if (watchMode) {
                    context.logger.raw("\n\n");
                }
            }
        };

        const doOnSuccessCleanup = async () => {
            if (onSuccessProcess !== undefined) {
                await killProcess({
                    pid: onSuccessProcess.pid as number,
                    signal: config.killSignal ?? "SIGTERM",
                });
            } else if (onSuccessCleanup !== undefined) {
                try {
                    await onSuccessCleanup();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    throw new Error(`onSuccess function cleanup failed: ${error.message}`, { cause: error });
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    throw new Error(`onSuccess function failed: ${error.message}`, { cause: error });
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
                    throw new Error(`onSuccess script failed with exit code ${exitCode}. Check the output above for details.`);
                }
            }
        };

        const start = Date.now();
        const getDuration = () => duration(Math.floor(Date.now() - start));

        if (mode === "watch") {
            if (context.options.rollup.watch === false) {
                throw new Error("Rollup watch is disabled. You should check your packem config.");
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
                    context.logger.raw("\n");
                }

                let outputMode: "console" | "file" = "console";
                let typeScriptVersion: string = "*";

                if (context.options.node10Compatibility) {
                    outputMode = context.options.node10Compatibility?.writeToPackageJson ? "file" : "console";
                    typeScriptVersion = context.options.node10Compatibility?.typeScriptVersion ?? "*";
                }

                await node10Compatibility(
                    context.logger,
                    context.options.entries,
                    context.options.outDir,
                    context.options.rootDir,
                    outputMode,
                    typeScriptVersion,
                );
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

        context.logger.raw(`\n⚡️ Build run in ${getDuration()}\n`);

        await runBuilder();

        await runOnsuccess();

        process.on("SIGINT", async () => {
            await doOnSuccessCleanup();
        });

        process.on("SIGTERM", async () => {
            await doOnSuccessCleanup();
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.raw("\n");

        enhanceRollupError(error);

        throw error;
    } finally {
        // Restore all wrapped console methods
        logger.restoreAll();

        await removeOldCacheFolders(cachePath, logger, logged);
    }
};

export default packem;
