import process from "node:process";

import { bold, cyan } from "@visulima/colorize";
import { findCacheDirSync } from "@visulima/find-cache-dir";
import { ensureDirSync, isAccessible } from "@visulima/fs";
import { duration } from "@visulima/humanizer";
import type { PackageJson } from "@visulima/package";
import type { Pail } from "@visulima/pail";
import { join, resolve } from "@visulima/path";
import type { TsConfigJson, TsConfigResult } from "@visulima/tsconfig";
import { findTsConfig, readTsConfig } from "@visulima/tsconfig";
import browserslist from "browserslist";
import { defu } from "defu";
import { createHooks } from "hookable";
import type { Jiti } from "jiti";
import { createJiti } from "jiti";
import { VERSION } from "rollup";
import type { Result as ExecChild } from "tinyexec";
import { exec } from "tinyexec";

import build from "./build";
import type { BuildConfigFunction } from "./config";
import { ALLOWED_TRANSFORM_EXTENSIONS_REGEX, DEFAULT_EXTENSIONS, DEFAULT_JS_EXTENSIONS, EXCLUDE_REGEXP, PRODUCTION_ENV } from "./constants";
import resolvePreset from "./hooks/preset/utils/resolve-preset";
import createStub from "./jit/create-stub";
import getHash from "./rollup/utils/get-hash";
import rollupWatch from "./rollup/watch";
import type { BuildConfig, BuildContext, BuildOptions, BuildPreset, Environment, InternalBuildOptions, Mode } from "./types";
import cleanDistributionDirectories from "./utils/clean-distribution-directories";
import createOrUpdateKeyStorage from "./utils/create-or-update-key-storage";
import enhanceRollupError from "./utils/enhance-rollup-error";
import FileCache from "./utils/file-cache";
import findPackemFile from "./utils/find-packem-file";
import getPackageSideEffect from "./utils/get-package-side-effect";
import killProcess from "./utils/kill-process";
import loadPackageJson from "./utils/load-package-json";
import logBuildErrors from "./utils/log-build-errors";
import prepareEntries from "./utils/prepare-entries";
import removeOldCacheFolders from "./utils/remove-old-cache-folders";
import packageJsonValidator from "./validator/package-json";
import validateAliasEntries from "./validator/validate-alias-entries";

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

const generateOptions = (
    logger: Pail,
    rootDirectory: string,
    environment: Environment,
    debug: boolean,
    inputConfig: BuildConfig,
    buildConfig: BuildConfig,
    preset: BuildPreset,
    packageJson: PackageJson,
    tsconfig: TsConfigResult | undefined,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): InternalBuildOptions => {
    const jsxRuntime = resolveTsconfigJsxToJsxRuntime(tsconfig?.config.compilerOptions?.jsx);

    // eslint-disable-next-line @typescript-eslint/prefer-ts-expect-error,@typescript-eslint/ban-ts-comment
    // @ts-ignore TS2589 is just deeply nested and this is needed for typedoc
    const options = defu(buildConfig, inputConfig, preset, <Partial<BuildOptions>>{
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
                extensions: DEFAULT_JS_EXTENSIONS,
                ignoreTryCatch: true,
                preserveSymlinks: true,
                // https://github.com/rollup/plugins/tree/master/packages/commonjs#transformmixedesmodules
                transformMixedEsModules: true,
            },
            css: {
                autoModules: true,
                extensions: [".css", ".pcss", ".postcss", ".sss"],
                namedExports: true,
            },
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
                // fast path to check if source contains a dynamic import. we check for a
                // trailing slash too as a dynamic import statement can have comments between
                // the `import` and the `(`.
                include: /\bimport\s*[(/]/,
            },
            esbuild: {
                charset: "utf8",
                jsx: jsxRuntime,
                jsxDev: tsconfig?.config.compilerOptions?.jsx === "react-jsxdev",
                jsxFactory: tsconfig?.config.compilerOptions?.jsxFactory,
                jsxFragment: tsconfig?.config.compilerOptions?.jsxFragmentFactory,
                jsxImportSource: tsconfig?.config.compilerOptions?.jsxImportSource,
                jsxSideEffects: true,
                // eslint-disable-next-line no-secrets/no-secrets
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
            // https://github.com/microsoft/TypeScript/issues/58944
            isolatedDeclarations: {
                exclude: EXCLUDE_REGEXP,
                ignoreErrors: false,
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
            },
            json: {
                preferConst: true,
            },
            license: {
                dependenciesTemplate: (licenses: string[], dependencyLicenseTexts: string, pName: string) =>
                    `\n# Licenses of bundled dependencies\n` +
                    `The published ${pName} artifact additionally contains code with the following licenses:\n` +
                    (licenses.length > 0 ? `${licenses.join(", ")}\n\n` : "\n") +
                    `# Bundled dependencies:\n` +
                    dependencyLicenseTexts,
                dtsTemplate: (licenses: string[], dependencyLicenseTexts: string, pName: string) =>
                    `\n# Licenses of bundled types\n` +
                    `The published ${pName} artifact additionally contains code with the following licenses:\n` +
                    (licenses.length > 0 ? `${licenses.join(", ")}\n\n` : "\n") +
                    `# Bundled types:\n` +
                    dependencyLicenseTexts,
            },
            node10Compatibility: {},
            patchTypes: {},
            polyfillNode: {},
            preserveDirectives: {
                include: ALLOWED_TRANSFORM_EXTENSIONS_REGEX,
            },
            preserveDynamicImports: true,
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
                exportConditions: ["module-sync"],
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
                ...(tsconfig?.config.compilerOptions?.jsx && ["react", "react-jsx", "react-jsxdev"].includes(tsconfig.config.compilerOptions.jsx)
                    ? {
                          jsxFragmentPragma: tsconfig.config.compilerOptions.jsxFragmentFactory,
                          jsxImportSource: tsconfig.config.compilerOptions.jsxImportSource,
                          jsxPragma: tsconfig.config.compilerOptions.jsxFactory,
                          jsxRuntime,
                          transforms: ["typescript", "jsx", ...(tsconfig.config.compilerOptions.esModuleInterop ? ["imports"] : [])],
                      }
                    : {
                          transforms: ["typescript", ...(tsconfig?.config.compilerOptions?.esModuleInterop ? ["imports"] : [])],
                      }),
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
                    externalHelpers: false,
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
    }) as InternalBuildOptions;

    if (!options.transformerName) {
        const dependencies = new Map([...Object.entries(packageJson.dependencies ?? {}), ...Object.entries(packageJson.devDependencies ?? {})]);

        let version = "0.0.0";

        if (dependencies.has("esbuild")) {
            options.transformerName = "esbuild";

            version = dependencies.get("esbuild") as string;
        } else if (dependencies.has("@swc/core")) {
            options.transformerName = "swc";

            version = dependencies.get("@swc/core") as string;
        } else if (dependencies.has("sucrase")) {
            options.transformerName = "sucrase";

            version = dependencies.get("sucrase") as string;
        } else {
            throw new Error("Unknown transformer, check your transformer options or install one of the supported transformers: esbuild, swc, sucrase");
        }

        logger.info("Using " + cyan("rollup ") + VERSION);
        logger.info({
            message: "Using " + cyan(options.transformerName) + " " + version,
            prefix: "transformer",
        });
    }

    if (options.rollup.resolve && options.rollup.resolve.preferBuiltins === true) {
        options.rollup.polyfillNode = false;

        logger.debug("Disabling polyfillNode because preferBuiltins is set to true");
    }

    if (options.browserTargets && options.browserTargets.length > 0) {
        logger.debug("Using browser targets: " + options.browserTargets.join(", "));
    }

    validateAliasEntries(options.alias);

    if (options.rollup.alias && options.rollup.alias.entries) {
        validateAliasEntries(options.rollup.alias.entries);
    }

    return options;
};

const createContext = async (
    logger: Pail,
    rootDirectory: string,
    mode: Mode,
    environment: Environment,
    debug: boolean,
    inputConfig: BuildConfig,
    buildConfig: BuildConfig,
    packageJson: PackageJson,
    tsconfig: TsConfigResult | undefined,
    jiti: Jiti,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<BuildContext> => {
    const preset = await resolvePreset(buildConfig.preset ?? inputConfig.preset ?? "auto", jiti);

    const options = generateOptions(logger, rootDirectory, environment, debug, inputConfig, buildConfig, preset, packageJson, tsconfig);

    ensureDirSync(join(options.rootDir, options.outDir));

    // Build context
    const context: BuildContext = {
        buildEntries: [],
        dependencyGraphMap: new Map<string, Set<[string, string]>>(),
        environment,
        hooks: createHooks(),
        // Create shared jiti instance for context
        jiti: createJiti(options.rootDir, options.jiti),
        logger,
        mode,
        options,
        pkg: packageJson,
        tsconfig,
        usedImports: new Set(),
        warnings: new Set(),
    };

    // Register hooks
    if (preset.hooks) {
        context.hooks.addHooks(preset.hooks);
    }

    if (inputConfig.hooks) {
        context.hooks.addHooks(inputConfig.hooks);
    }

    if (buildConfig.hooks) {
        context.hooks.addHooks(buildConfig.hooks);
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

    const hasTypescript = packageJson.dependencies?.typescript !== undefined || packageJson.devDependencies?.typescript !== undefined;

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
        context.logger.info("Using typescript version: " + cyan(packageJson.devDependencies?.typescript ?? packageJson.dependencies?.typescript ?? "unknown"));
    }

    if (
        context.options.declaration &&
        (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript) &&
        !context.tsconfig?.config.compilerOptions?.isolatedModules
    ) {
        context.logger.warn(
            `'compilerOptions.isolatedModules' is not enabled in tsconfig.\nBecause none of the third-party transpiler, packem uses under the hood is type-aware, some techniques or features often used in TypeScript are not properly checked and can cause mis-compilation or even runtime errors.\nTo mitigate this, you should set the isolatedModules option to true in tsconfig and let your IDE warn you when such incompatible constructs are used.`,
        );
    }

    await prepareEntries(context);

    return context;
};

const getMode = (mode: Mode): string => {
    switch (mode) {
        case "jit": {
            return "Stubbing";
        }
        case "watch": {
            return "Watching";
        }
        case "tsdoc": {
            return "Generating TSDoc";
        }
        default: {
            return "Building";
        }
    }
};

const packem = async (
    rootDirectory: string,
    mode: Mode,
    environment: Environment,
    logger: Pail,
    inputConfig: {
        configPath?: string;
        debug?: boolean;
        tsconfigPath?: string;
    } & BuildConfig = {},
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<void> => {
    const { configPath, debug, tsconfigPath, ...otherInputConfig } = inputConfig;

    logger.wrapAll();

    // Determine rootDirectory
    // eslint-disable-next-line no-param-reassign
    rootDirectory = resolve(process.cwd(), rootDirectory);

    logger.debug("Root directory:", rootDirectory);

    const { packageJson, packageJsonPath } = loadPackageJson(rootDirectory);

    logger.debug("Using package.json found at", packageJsonPath);

    let tsconfig: TsConfigResult | undefined;

    if (tsconfigPath) {
        const rootTsconfigPath = join(rootDirectory, tsconfigPath);

        if (!(await isAccessible(rootTsconfigPath))) {
            throw new Error("tsconfig.json not found at " + rootTsconfigPath);
        }

        tsconfig = {
            config: readTsConfig(rootTsconfigPath),
            path: rootTsconfigPath,
        };

        logger.info("Using tsconfig settings at", rootTsconfigPath);
    } else if (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript) {
        try {
            tsconfig = await findTsConfig(rootDirectory);

            logger.debug("Using tsconfig settings found at", tsconfig.path);
        } catch {
            logger.info("No tsconfig.json or jsconfig.json found.");
        }
    }

    const cachePath = findCacheDirSync("@visulima/packem", {
        cwd: rootDirectory,
    });

    let logged = false;
    let onSuccessProcess: ExecChild | undefined;
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type,@typescript-eslint/no-explicit-any
    let onSuccessCleanup: (() => any) | undefined | void;

    try {
        const packemConfigFilePath = await findPackemFile(rootDirectory, configPath ?? "");

        const jiti = createJiti(rootDirectory, { debug });

        let buildConfig = ((await jiti.import(packemConfigFilePath, { default: true, try: true })) || {}) as BuildConfig | BuildConfigFunction;

        if (typeof buildConfig === "function") {
            buildConfig = await buildConfig(environment, mode);
        }

        logger.debug("Using packem config found at", join(rootDirectory, packemConfigFilePath));

        const cacheKey =
            getHash(
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
                    type: packageJson.type,
                    types: packageJson.types,
                }),
            ) + getHash(JSON.stringify(buildConfig));

        if (cachePath) {
            createOrUpdateKeyStorage(cacheKey, cachePath as string, logger);
        }

        const fileCache = new FileCache(rootDirectory, cachePath, cacheKey, logger);

        const context = await createContext(
            logger,
            rootDirectory,
            mode,
            environment,
            debug ?? false,
            otherInputConfig,
            buildConfig,
            packageJson,
            tsconfig,
            jiti,
        );

        fileCache.isEnabled = context.options.fileCache as boolean;

        context.logger.info(cyan(getMode(mode) + " " + context.options.name));

        context.logger.debug({
            context: context.options.entries,
            message: `${bold("Root dir:")} ${context.options.rootDir}\n  ${bold("Entries:")}`,
        });

        // Clean dist dirs
        await cleanDistributionDirectories(context);

        const runBuilder = async (watchMode?: true) => {
            for await (const [name, builder] of Object.entries(context.options.builder ?? {})) {
                context.logger.raw("\n");

                await context.hooks.callHook("builder:before", name, context);

                const builderStart = Date.now();

                const getBuilderDuration = () => duration(Math.floor(Date.now() - builderStart));

                await builder(context, cachePath, fileCache, logged);

                await context.hooks.callHook("builder:done", name, context);

                context.logger.raw("\n⚡️ " + name + " run in " + getBuilderDuration());

                if (watchMode) {
                    context.logger.raw("\n\n");
                }
            }
        };

        const doOnSuccessCleanup = async () => {
            if (onSuccessProcess !== undefined) {
                await killProcess({
                    pid: onSuccessProcess.pid as number,
                    signal: otherInputConfig.killSignal ?? buildConfig.killSignal ?? "SIGTERM",
                });
            } else if (onSuccessCleanup !== undefined) {
                try {
                    await onSuccessCleanup();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    throw new Error("onSuccess function cleanup failed: " + error.message, { cause: error });
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
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    throw new Error("onSuccess function failed: " + error.message, { cause: error });
                }
            } else if (typeof context.options.onSuccess === "string") {
                const timeout = context.options.onSuccessTimeout ?? 30_000; // 30 seconds default

                onSuccessProcess = exec(context.options.onSuccess, [], {
                    nodeOptions: {
                        shell: true,
                        stdio: "inherit",
                        timeout,
                    },
                });

                await onSuccessProcess;

                if (onSuccessProcess.exitCode && onSuccessProcess.exitCode !== 0) {
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    throw new Error("onSuccess script failed with exit code " + onSuccessProcess.exitCode + ". Check the output above for details.");
                }
            }
        };

        const start = Date.now();
        const getDuration = () => duration(Math.floor(Date.now() - start));

        if (mode === "watch") {
            if (context.options.rollup.watch === false) {
                throw new Error("Rollup watch is disabled. You should check your packem.config file.");
            }

            await rollupWatch(context, fileCache, runBuilder, runOnsuccess, doOnSuccessCleanup);

            logBuildErrors(context, false);

            return;
        }

        if (mode === "jit") {
            await createStub(context);

            await context.hooks.callHook("build:done", context);
        } else {
            logged = await build(context, fileCache);

            await context.hooks.callHook("validate:before", context);

            packageJsonValidator(context);

            await context.hooks.callHook("validate:done", context);

            logBuildErrors(context, logged);
        }

        context.logger.raw("\n⚡️ Build run in " + getDuration());

        await runBuilder();

        await runOnsuccess();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        process.on("SIGINT", async () => {
            await doOnSuccessCleanup();
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
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

export type {
    BuildConfig,
    BuildContext,
    BuildContextBuildAssetAndChunk,
    BuildContextBuildEntry,
    BuildEntry,
    BuildHooks,
    BuildOptions,
    BuildPreset,
    Environment,
    Mode,
    RollupBuildOptions,
    Runtime,
} from "./types";
