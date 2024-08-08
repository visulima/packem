import { readdir, stat } from "node:fs/promises";
import Module from "node:module";
import { cwd, env } from "node:process";

import { bold, cyan, gray, green } from "@visulima/colorize";
import { emptyDir, ensureDirSync, isAccessible, isAccessibleSync, walk } from "@visulima/fs";
import { NotFoundError } from "@visulima/fs/error";
import { duration, formatBytes } from "@visulima/humanizer";
import type { PackageJson } from "@visulima/package";
import { parsePackageJson } from "@visulima/package/package-json";
import type { Pail } from "@visulima/pail";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from "@visulima/path";
import type { TsConfigJson, TsConfigResult } from "@visulima/tsconfig";
import { findTsConfig, readTsConfig } from "@visulima/tsconfig";
import { defu } from "defu";
import { createHooks } from "hookable";
import { VERSION } from "rollup";

import { DEFAULT_EXTENSIONS, EXCLUDE_REGEXP } from "./constants";
import createStub from "./jit/create-stub";
import resolvePreset from "./preset/utils/resolve-preset";
import rollupBuild from "./rollup/build";
import rollupBuildTypes from "./rollup/build-types";
import getHash from "./rollup/utils/get-hash";
import rollupWatch from "./rollup/watch";
import type { BuildConfig, BuildContext, BuildContextBuildEntry, BuildOptions, BuildPreset, InternalBuildOptions, Mode } from "./types";
import dumpObject from "./utils/dump-object";
import enhanceRollupError from "./utils/enhance-rollup-error";
import FileCache from "./utils/file-cache";
import getPackageSideEffect from "./utils/get-package-side-effect";
import groupByKeys from "./utils/group-by-keys";
import tryRequire from "./utils/try-require";
import validateAliasEntries from "./validator/validate-alias-entries";
import validateDependencies from "./validator/validate-dependencies";
import validatePackage from "./validator/validate-package";

type PackEmPackageJson = { packem?: BuildConfig } & PackageJson;

const logErrors = (context: BuildContext, hasOtherLogs: boolean): void => {
    if (context.warnings.size > 0) {
        if (hasOtherLogs) {
            context.logger.raw("\n");
        }

        context.logger.warn(`Build is done with some warnings:\n\n${[...context.warnings].map((message) => `- ${message}`).join("\n")}`);

        if (context.options.failOnWarn) {
            throw new Error("Exiting with code (1). You can change this behavior by setting `failOnWarn: false`.");
        }
    }
};

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
    mode: Mode,
    debug: boolean,
    inputConfig: BuildConfig,
    buildConfig: BuildConfig,
    preset: BuildPreset,
    packageJson: PackEmPackageJson,
    tsconfig: TsConfigResult | undefined,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): InternalBuildOptions => {
    const jsxRuntime = resolveTsconfigJsxToJsxRuntime(tsconfig?.config.compilerOptions?.jsx);

    const options = defu(buildConfig, inputConfig, preset, <BuildOptions>{
        alias: {},
        clean: true,
        debug,
        declaration: true,
        emitCJS: true,
        emitESM: true,
        entries: [],
        externals: [...Module.builtinModules, ...Module.builtinModules.map((m) => `node:${m}`)],
        failOnWarn: true,
        fileCache: true,
        minify: env.NODE_ENV === "production",
        name: (packageJson.name ?? "").split("/").pop() ?? "default",
        outDir: "dist",
        replace: {},
        rollup: {
            alias: {},
            cjsInterop: { addDefaultProperty: false },
            commonjs: {
                ignoreTryCatch: true,
                preserveSymlinks: true,
                // https://github.com/rollup/plugins/tree/master/packages/commonjs#transformmixedesmodules
                transformMixedEsModules: false,
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
                // fast path to check if source contains a dynamic import. we check for a
                // trailing slash too as a dynamic import statement can have comments between
                // the `import` and the `(`.
                include: /\bimport\s*[(/]/,
            },
            esbuild: {
                charset: "utf8",
                include: /\.[jt]sx?$/,
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
            isolatedDeclarations: {
                exclude: EXCLUDE_REGEXP,
                ignoreErrors: false,
                include: [/\.[cm]?ts$/],
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
            patchTypes: {},
            polyfillNode: {},
            preserveDynamicImports: true,
            raw: {
                exclude: EXCLUDE_REGEXP,
                include: ["**/*.data", "**/*.txt"],
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
                // Following option must be *false* for polyfill to work
                preferBuiltins: false,
            },
            shim: true,
            sucrase: {
                disableESTransforms: true,
                enableLegacyBabel5ModuleInterop: false,
                enableLegacyTypeScriptModuleInterop: tsconfig?.config.compilerOptions?.esModuleInterop === false,
                include: /\.[jt]sx?$/,
                injectCreateRequireForImportRequire: false,
                preserveDynamicImport: true,
                production: env.NODE_ENV === "production",
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
                include: /\.[jt]sx?$/,
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
                        legacyDecorator: tsconfig?.config.compilerOptions?.experimentalDecorators,
                        react: {
                            development: env.NODE_ENV !== "production",
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
                transform: {
                    decoratorVersion: "2022-03",
                },
            },
            treeshake: {
                moduleSideEffects: getPackageSideEffect(rootDirectory, packageJson),
                preset: "recommended",
            },
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
        stub: mode === "jit",
        stubOptions: {
            /**
             * See https://github.com/unjs/jiti#options
             */
            jiti: {
                alias: {},
                esmResolve: true,
                interopDefault: true,
            },
        },
        transformerName: undefined,
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

    if (packageJson.devDependencies?.typescript && !tsconfig?.config.compilerOptions?.isolatedModules) {
        logger.warn(
            `'compilerOptions.isolatedModules' is not enabled in tsconfig.\nBecause none of the third-party transpiler, packem uses under the hood is type-aware, some techniques or features often used in TypeScript are not properly checked and can cause mis-compilation or even runtime errors.\nTo mitigate this, you should set the isolatedModules option to true in tsconfig and let your IDE warn you when such incompatible constructs are used.`,
        );
    }

    // Add all dependencies as externals
    if (packageJson.dependencies) {
        options.externals.push(...Object.keys(packageJson.dependencies));
    }

    if (packageJson.peerDependencies) {
        options.externals.push(...Object.keys(packageJson.peerDependencies));
    }

    if (packageJson.optionalDependencies) {
        options.externals.push(...Object.keys(packageJson.optionalDependencies));
    }

    validateAliasEntries(options.alias);

    if (options.rollup.alias && options.rollup.alias.entries) {
        validateAliasEntries(options.rollup.alias.entries);
    }

    return options;
};

const removeExtension = (filename: string): string => filename.replace(/\.(?:js|mjs|cjs|ts|mts|cts|json|jsx|tsx)$/, "");

// eslint-disable-next-line sonarjs/cognitive-complexity
const prepareEntries = async (context: BuildContext, rootDirectory: string): Promise<void> => {
    // Normalize entries
    context.options.entries = context.options.entries.map((entry) => (typeof entry === "string" ? { input: entry } : entry));

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for await (const entry of context.options.entries) {
        if (typeof entry.name !== "string") {
            let relativeInput = isAbsolute(entry.input) ? relative(rootDirectory, entry.input) : normalize(entry.input);

            if (relativeInput.startsWith("./")) {
                relativeInput = relativeInput.slice(2);
            }

            entry.name = removeExtension(relativeInput.replace(/^src\//, ""));
        }

        if (!entry.input) {
            throw new Error(`Missing entry input: ${dumpObject(entry)}`);
        }

        entry.input = resolve(context.options.rootDir, entry.input);

        if (!isAccessibleSync(entry.input)) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const filesInWorkingDirectory = new Set(await readdir(dirname(entry.input)));

            let hasFile = false;

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const extension of DEFAULT_EXTENSIONS) {
                if (filesInWorkingDirectory.has(basename(entry.input) + extension)) {
                    hasFile = true;
                    break;
                }
            }

            if (!hasFile) {
                throw new NotFoundError("Your configured entry: " + cyan(entry.input) + " does not exist.");
            }
        }

        entry.outDir = resolve(context.options.rootDir, entry.outDir ?? context.options.outDir);
    }
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const showSizeInformation = (logger: Pail, context: BuildContext, packageJson: PackEmPackageJson): boolean => {
    const rPath = (p: string) => relative(context.options.rootDir, resolve(context.options.outDir, p));

    let loggedEntries = false;

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const entry of context.buildEntries.filter((bEntry) => !bEntry.chunk)) {
        let totalBytes = entry.bytes ?? 0;

        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const chunk of entry.chunks ?? []) {
            totalBytes += context.buildEntries.find((bEntry) => bEntry.path === chunk)?.bytes ?? 0;
        }

        let line = `  ${bold(rPath(entry.path))} (${[
            "total size: " + cyan(formatBytes(totalBytes)),
            entry.type !== "asset" && entry.bytes && "chunk size: " + cyan(formatBytes(entry.bytes)),
        ]
            .filter(Boolean)
            .join(", ")})`;

        line += entry.exports?.length ? "\n  exports: " + gray(entry.exports.join(", ")) : "";

        if (entry.chunks?.length) {
            line += `\n${entry.chunks
                .map((p) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const chunk = context.buildEntries.find((buildEntry) => buildEntry.path === p) ?? ({} as any);

                    return gray("  └─ " + rPath(p) + bold(chunk.bytes ? " (" + formatBytes(chunk?.bytes) + ")" : ""));
                })
                .join("\n")}`;
        }

        if (entry.modules && entry.modules.length > 0) {
            const moduleList = entry.modules
                .filter((m) => m.id.includes("node_modules"))
                .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))

                .map((m) => gray("  📦 " + rPath(m.id) + bold(m.bytes ? " (" + formatBytes(m.bytes) + ")" : "")))
                .join("\n");

            line += moduleList.length > 0 ? "\n  inlined modules:\n" + moduleList : "";
        }

        // find types for entry
        if (context.options.declaration && entry.type === "entry") {
            let dtsPath = entry.path.replace(/\.js$/, ".d.ts");
            let type = "commonjs";

            if (entry.path.endsWith(".cjs")) {
                dtsPath = entry.path.replace(/\.cjs$/, ".d.cts");
            } else if (entry.path.endsWith(".mjs")) {
                type = "module";
                dtsPath = entry.path.replace(/\.mjs$/, ".d.mts");
            }

            const foundDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));

            if (foundDts) {
                let foundCompatibleDts: BuildContextBuildEntry | undefined;

                if ((context.options.declaration === true || context.options.declaration === "compatible") && !dtsPath.includes(".d.ts")) {
                    dtsPath = (dtsPath as string).replace(type === "commonjs" ? ".d.c" : ".d.m", ".d.");

                    foundCompatibleDts = context.buildEntries.find((bEntry) => bEntry.path.endsWith(dtsPath));
                }

                line +=
                    foundCompatibleDts && type === packageJson.type
                        ? "\n  types:\n" +
                          [foundDts, foundCompatibleDts]
                              .map(
                                  (value: BuildContextBuildEntry) =>
                                      gray("  └─ ") + bold(rPath(value.path)) + " (total size: " + cyan(formatBytes(value.bytes ?? 0)) + ")",
                              )
                              .join("\n")
                        : "\n  types: " + bold(rPath(foundDts.path)) + " (total size: " + cyan(formatBytes(foundDts.bytes ?? 0)) + ")";
            }
        }

        loggedEntries = true;

        line += "\n\n";

        logger.raw(entry.chunk ? gray(line) : line);
    }

    if (loggedEntries) {
        logger.raw("Σ Total dist size (byte size):", cyan(formatBytes(context.buildEntries.reduce((index, entry) => index + (entry.bytes ?? 0), 0))), "\n");
    }

    return loggedEntries;
};

const createContext = async (
    logger: Pail,
    rootDirectory: string,
    mode: Mode,
    debug: boolean,
    inputConfig: BuildConfig,
    buildConfig: BuildConfig,
    packageJson: PackEmPackageJson,
    tsconfig: TsConfigResult | undefined,
): Promise<BuildContext> => {
    const preset = resolvePreset(buildConfig.preset ?? inputConfig.preset ?? "auto", rootDirectory);

    const options = generateOptions(logger, rootDirectory, mode, debug, inputConfig, buildConfig, preset, packageJson, tsconfig);

    ensureDirSync(join(options.rootDir, options.outDir));

    // Build context
    const context: BuildContext = {
        buildEntries: [],
        dependencyGraphMap: new Map(),
        hooks: createHooks(),
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

    if (!context.options.emitESM && !context.options.emitCJS) {
        throw new Error("Both emitESM and emitCJS are disabled. At least one of them must be enabled.");
    }

    if (context.options.emitESM === undefined) {
        context.logger.info("Emitting ESM bundles, is disabled.");
    }

    if (context.options.emitCJS === undefined) {
        context.logger.info("Emitting CJS bundles, is disabled.");
    }

    if (context.options.declaration && tsconfig === undefined && packageJson.devDependencies?.typescript) {
        throw new Error("               Cannot build declaration files without a tsconfig.json");
    }

    if (!packageJson.devDependencies?.typescript) {
        context.options.declaration = false;
    }

    if (!context.options.declaration) {
        context.logger.info("Declaration files, are disabled.");
    }

    return context;
};

const cleanDistributionDirectories = async (context: BuildContext): Promise<void> => {
    const cleanedDirectories: string[] = [];

    if (context.options.clean) {
        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const directory of new Set(
            // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
            context.options.entries
                .map((entry) => entry.outDir)
                .filter(Boolean)
                .sort() as unknown as Set<string>,
        )) {
            if (
                directory === context.options.rootDir ||
                directory === context.options.sourceDir ||
                context.options.rootDir.startsWith(directory.endsWith("/") ? directory : `${directory}/`) ||
                cleanedDirectories.some((c) => directory.startsWith(c))
            ) {
                // eslint-disable-next-line no-continue
                continue;
            }

            cleanedDirectories.push(directory);
            context.logger.info(`Cleaning dist directory: \`./${relative(context.options.rootDir, directory)}\``);

            // eslint-disable-next-line no-await-in-loop
            await emptyDir(directory);
        }
    }
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const build = async (context: BuildContext, packageJson: PackEmPackageJson, fileCache: FileCache): Promise<void> => {
    // Call build:before
    await context.hooks.callHook("build:before", context);

    if (context.options.minify) {
        context.logger.info("Minification is enabled, the output will be minified");
    }

    const groupedEntries = groupByKeys(context.options.entries, "environment", "runtime");

    const rollups: Promise<void>[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const [environment, environmentEntries] of Object.entries(groupedEntries)) {
        // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
        for (const [runtime, entries] of Object.entries(environmentEntries)) {
            context.logger.info("Preparing build for " + cyan(environment) + " environment" + (runtime ? " with " + cyan(runtime) + " runtime" : ""));

            if (context.options.rollup.replace) {
                context.options.rollup.replace.values = {
                    ...context.options.rollup.replace.values,
                    "process.env.NODE_ENV": environment,
                };

                if (runtime === "edge-light") {
                    context.options.rollup.replace.values.EdgeRuntime = "edge-runtime";
                }
            } else {
                context.logger.warn("'replace' plugin is disabled. You should enable it to replace 'process.env.*' environments.");
            }

            const esmAndCjsEntries = [];
            const esmEntries = [];
            const cjsEntries = [];

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const entry of entries) {
                if (entry.cjs && entry.esm) {
                    esmAndCjsEntries.push(entry);
                } else if (entry.cjs) {
                    cjsEntries.push(entry);
                } else if (entry.esm) {
                    esmEntries.push(entry);
                }
            }

            if (esmAndCjsEntries.length > 0) {
                const adjustedEsmAndCjsContext = {
                    ...context,
                    options: { ...context.options, emitCJS: true, emitESM: true, entries: esmAndCjsEntries },
                };

                rollups.push(rollupBuild(adjustedEsmAndCjsContext, fileCache));

                const typedEntries = adjustedEsmAndCjsContext.options.entries.filter((entry) => entry.declaration);

                if (context.options.declaration && typedEntries.length > 0) {
                    rollups.push(
                        rollupBuildTypes(
                            {
                                ...adjustedEsmAndCjsContext,
                                options: {
                                    ...adjustedEsmAndCjsContext.options,
                                    entries: typedEntries,
                                },
                            },
                            fileCache,
                        ),
                    );
                }
            }

            if (esmEntries.length > 0) {
                const adjustedEsmContext = {
                    ...context,
                    options: { ...context.options, emitCJS: false, emitESM: true, entries: esmEntries },
                };

                rollups.push(rollupBuild(adjustedEsmContext, fileCache));

                const typedEntries = adjustedEsmContext.options.entries.filter((entry) => entry.declaration);

                if (context.options.declaration && typedEntries.length > 0) {
                    rollups.push(
                        rollupBuildTypes(
                            {
                                ...adjustedEsmContext,
                                options: {
                                    ...adjustedEsmContext.options,
                                    entries: typedEntries,
                                },
                            },
                            fileCache,
                        ),
                    );
                }
            }

            if (cjsEntries.length > 0) {
                const adjustedCjsContext = {
                    ...context,
                    options: { ...context.options, emitCJS: true, emitESM: false, entries: cjsEntries },
                };

                rollups.push(rollupBuild(adjustedCjsContext, fileCache));

                const typedEntries = adjustedCjsContext.options.entries.filter((entry) => entry.declaration);

                if (context.options.declaration && typedEntries.length > 0) {
                    rollups.push(
                        rollupBuildTypes(
                            {
                                ...adjustedCjsContext,
                                options: {
                                    ...adjustedCjsContext.options,
                                    entries: typedEntries,
                                },
                            },
                            fileCache,
                        ),
                    );
                }
            }
        }
    }

    await Promise.all(rollups);

    context.logger.success(green(context.options.name ? "Build succeeded for " + context.options.name : "Build succeeded"));

    // Find all dist files and add missing entries as chunks
    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for await (const file of walk(join(context.options.rootDir, context.options.outDir))) {
        let entry = context.buildEntries.find((bEntry) => join(context.options.rootDir, context.options.outDir, bEntry.path) === file.path);

        if (!entry) {
            entry = {
                chunk: true,
                path: file.path,
            };

            context.buildEntries.push(entry);
        }

        if (!entry.bytes) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const awaitedStat = await stat(resolve(context.options.rootDir, context.options.outDir, file.path));

            entry.bytes = awaitedStat.size;
        }
    }

    const logged = showSizeInformation(context.logger, context, packageJson);

    // Validate
    validateDependencies(context);
    validatePackage(packageJson, context);

    // Call build:done
    await context.hooks.callHook("build:done", context);

    logErrors(context, logged);
};

const createBundler = async (
    rootDirectory: string,
    mode: Mode,
    logger: Pail,
    inputConfig: {
        configPath?: string;
        debug?: boolean;
        tsconfigPath?: string;
    } & BuildConfig = {},
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<void> => {
    const { configPath, debug, tsconfigPath, ...restInputConfig } = inputConfig;

    logger.wrapAll();

    // Determine rootDirectory
    // eslint-disable-next-line no-param-reassign
    rootDirectory = resolve(cwd(), rootDirectory);

    logger.debug("Root directory:", rootDirectory);

    const packageJsonPath = join(rootDirectory, "package.json");

    if (!isAccessibleSync(packageJsonPath)) {
        throw new Error("package.json not found at " + packageJsonPath);
    }

    const packageJson = parsePackageJson(packageJsonPath);

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
    } else if (packageJson.devDependencies?.typescript) {
        try {
            tsconfig = await findTsConfig(rootDirectory);

            logger.debug("Using tsconfig settings found at", tsconfig.path);
        } catch {
            logger.info("No tsconfig.json or jsconfig.json found.");
        }
    }

    try {
        const packemConfigFileName = configPath ?? "./packem.config.ts";

        if (!/\.(?:js|mjs|cjs|ts)$/.test(packemConfigFileName)) {
            throw new Error("Invalid packem config file extension. Only .js, .mjs, .cjs, .ts extensions are allowed.");
        }

        const buildConfig = tryRequire<BuildConfig>(packemConfigFileName, rootDirectory);

        logger.debug("Using packem config found at", join(rootDirectory, packemConfigFileName));

        const start = Date.now();

        const getDuration = () => duration(Math.floor(Date.now() - start));

        const cachekey = getHash(
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
        );
        const fileCache = new FileCache(rootDirectory, cachekey, logger);

        // clear cache if the cache key has changed
        if (fileCache.cachePath && !isAccessibleSync(join(fileCache.cachePath, cachekey)) && isAccessibleSync(fileCache.cachePath)) {
            logger.info("Clearing file cache because the cache key has changed.");

            await emptyDir(fileCache.cachePath);
        }

        const context = await createContext(logger, rootDirectory, mode, debug ?? false, restInputConfig, buildConfig, packageJson, tsconfig);

        fileCache.isEnabled = context.options.fileCache as boolean;

        await prepareEntries(context, rootDirectory);

        context.logger.info(cyan((mode === "watch" ? "Watching" : mode === "jit" ? "Stubbing" : "Building") + " " + context.options.name));

        context.logger.debug(
            `${bold("Root dir:")} ${context.options.rootDir}\n  ${bold("Entries:")}\n  ${context.options.entries.map((entry) => `  ${dumpObject(entry)}`).join("\n  ")}`,
        );

        // Clean dist dirs
        await cleanDistributionDirectories(context);

        // Skip rest for stub
        if (context.options.stub) {
            await createStub(context);

            await context.hooks.callHook("build:done", context);

            return;
        }

        if (mode === "watch") {
            if (context.options.rollup.watch === false) {
                throw new Error("Rollup watch is disabled. You should check your packem.config file.");
            }

            await rollupWatch(context, fileCache);

            logErrors(context, false);

            return;
        }

        await build(context, packageJson as PackEmPackageJson, fileCache);

        logger.raw("\n⚡️ Build run in " + getDuration());

        // Restore all wrapped console methods
        logger.restoreAll();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.raw("\n");

        enhanceRollupError(error);

        throw error;
    }
};

export default createBundler;
