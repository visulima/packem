/* eslint-disable import/exports-last -- exports are intentionally interleaved with helper code by topic */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { TsConfigJson, TsConfigJsonResolved } from "@visulima/tsconfig";
import { findTsConfigSync, readTsConfig } from "@visulima/tsconfig";
import type { IsolatedDeclarationsOptions } from "oxc-transform";
import type { RenderedChunk } from "rollup";
import ts from "typescript";

type AddonFunction = (chunk: RenderedChunk) => string | Promise<string>;

export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | undefined;

// #region General Options
export interface GeneralOptions {
    /**
     * Determines how the default export is emitted.
     *
     * If set to `true`, and you are only exporting a single item using `export default ...`,
     * the output will use `export = ...` instead of the standard ES module syntax.
     * This is useful for compatibility with CommonJS.
     */
    cjsDefault?: boolean;

    /**
     * Override the `compilerOptions` specified in `tsconfig.json`.
     * @see https://www.typescriptlang.org/tsconfig/#compilerOptions
     */
    compilerOptions?: TsConfigJson.CompilerOptions;

    /**
     * The directory in which the plugin will search for the `tsconfig.json` file.
     */
    cwd?: string;

    /**
     * Set to `true` if your entry files are `.d.ts` files instead of `.ts` files.
     *
     * When enabled, the plugin will skip generating a `.d.ts` file for the entry point.
     */
    dtsInput?: boolean;

    /**
     * If `true`, the plugin will emit only `.d.ts` files and remove all other output chunks.
     *
     * This is especially useful when generating `.d.ts` files for the CommonJS format as part of a separate build step.
     */
    emitDtsOnly?: boolean;

    /**
     * A pattern (or array of patterns) specifying files to exclude from DTS generation.
     * Files matching this pattern will be skipped by the transform hook and will not have
     * `.d.ts` files generated.
     *
     * Accepts minimatch glob patterns, regular expressions, or arrays of either.
     */
    exclude?: FilterPattern;

    /**
     * A pattern (or array of patterns) specifying files to include in DTS generation.
     * Only files matching this pattern will have `.d.ts` files generated.
     *
     * By default, all TypeScript and Vue files are included.
     * Accepts minimatch glob patterns, regular expressions, or arrays of either.
     */
    include?: FilterPattern;

    /**
     * Controls whether type definitions from `node_modules` are bundled into your final `.d.ts` file or kept as external `import` statements.
     *
     * By default, dependencies are external, resulting in `import { Type } from 'some-package'`. When bundled, this `import` is removed, and the type definitions from `some-package` are copied directly into your file.
     *
     * - `true`: Bundles all dependencies.
     * - `false`: (Default) Keeps all dependencies external.
     * - `(string | RegExp)[]`: Bundles only dependencies matching the provided strings or regular expressions (e.g. `['pkg-a', /^@scope\//]`).
     */
    resolve?: boolean | (string | RegExp)[];

    /**
     * Specifies a resolver to resolve type definitions, especially for `node_modules`.
     *
     * - `'oxc'`: Uses Oxc's module resolution, which is faster and more efficient.
     * - `'tsc'`: Uses TypeScript's native module resolution, which may be more compatible with complex setups, but slower.
     * @default 'oxc'
     */
    resolver?: "oxc" | "tsc";

    /**
     * Indicates whether the generated `.d.ts` files have side effects.
     * - If set to `true`, Rolldown will treat the `.d.ts` files as having side effects during tree-shaking.
     * - If set to `false`, Rolldown may consider the `.d.ts` files as side-effect-free, potentially removing them if they are not imported.
     * @default false
     */
    sideEffects?: boolean;

    /**
     * If `true`, the plugin will generate declaration maps (`.d.ts.map`) for `.d.ts` files.
     */
    sourcemap?: boolean;

    /**
     * The path to the `tsconfig.json` file.
     *
     * If set to `false`, the plugin will ignore any `tsconfig.json` file.
     * You can still specify `compilerOptions` directly in the options.
     * @default 'tsconfig.json'
     */
    tsconfig?: string | boolean;

    /**
     * Pass a raw `tsconfig.json` object directly to the plugin.
     * @see https://www.typescriptlang.org/tsconfig
     */
    tsconfigRaw?: Omit<TsConfigJson, "compilerOptions">;
}

// #region tsc Options
export interface TscOptions {
    /**
     * Content to be added at the top of each generated `.d.ts` file.
     */
    banner?: string | Promise<string> | AddonFunction;

    /**
     * Build mode for the TypeScript compiler:
     *
     * - If `true`, the plugin will use [`tsc -b`](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript) to build the project and all referenced projects before emitting `.d.ts` files.
     * - If `false`, the plugin will use [`tsc`](https://www.typescriptlang.org/docs/handbook/compiler-options.html) to emit `.d.ts` files without building referenced projects.
     * @default false
     */
    build?: boolean;

    /**
     * If `true`, the plugin will prepare all files listed in `tsconfig.json` for `tsc` or `vue-tsc`.
     *
     * This is especially useful when you have a single `tsconfig.json` for multiple projects in a monorepo.
     */
    eager?: boolean;

    /**
     * If `true`, the plugin will emit `.d.ts` files for `.js` files as well.
     * This is useful when you want to generate type definitions for JavaScript files with JSDoc comments.
     *
     * Enabled by default when `allowJs` in compilerOptions is `true`.
     * This option is only used when {@link Options.oxc} is
     * `false`.
     */
    emitJs?: boolean;

    /**
     * Content to be added at the bottom of each generated `.d.ts` file.
     */
    footer?: string | Promise<string> | AddonFunction;

    /**
     * If your tsconfig.json has
     * [`references`](https://www.typescriptlang.org/tsconfig/#references) option,
     * `@visulima/rollup-plugin-dts` will use [`tsc
     * -b`](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript)
     * to build the project and all referenced projects before emitting `.d.ts`
     * files.
     *
     * In such case, if this option is `true`, `@visulima/rollup-plugin-dts` will write
     * down all built files into your disk, including
     * [`.tsbuildinfo`](https://www.typescriptlang.org/tsconfig/#tsBuildInfoFile)
     * and other built files. This is equivalent to running `tsc -b` in your
     * project.
     *
     * Otherwise, if this option is `false`, `@visulima/rollup-plugin-dts` will write
     * built files only into memory and leave a small footprint in your disk.
     *
     * Enabling this option will decrease the build time by caching previous build
     * results. This is helpful when you have a large project with multiple
     * referenced projects.
     *
     * By default, `incremental` is `true` if your tsconfig has
     * [`incremental`](https://www.typescriptlang.org/tsconfig/#incremental) or
     * [`tsBuildInfoFile`](https://www.typescriptlang.org/tsconfig/#tsBuildInfoFile)
     * enabled.
     *
     * This option is only used when {@link Options.oxc} is
     * `false`.
     */
    incremental?: boolean;

    /**
     * If `true`, the plugin will create a new isolated context for each build,
     * ensuring that previously generated `.d.ts` code and caches are not reused.
     *
     * By default, the plugin may reuse internal caches or incremental build artifacts
     * to speed up repeated builds. Enabling this option forces a clean context,
     * guaranteeing that all type definitions are generated from scratch.
     * @default false
     */
    newContext?: boolean;

    /**
     * If `true`, the plugin will launch a separate process for `tsc` or `vue-tsc`.
     * This enables processing multiple projects in parallel.
     */
    parallel?: boolean;

    /**
     * If `true`, the plugin will generate `.d.ts` files using `@ts-macro/tsc`.
     */
    tsMacro?: boolean;

    /**
     * If `true`, the plugin will generate `.d.ts` files using `vue-tsc`.
     */
    vue?: boolean;
}

export interface Options extends GeneralOptions, TscOptions {
    // #region Oxc

    /**
     * If `true`, the plugin will generate `.d.ts` files using Oxc,
     * which is significantly faster than the TypeScript compiler.
     *
     * This option is automatically enabled when `isolatedDeclarations` in `compilerOptions` is set to `true`.
     */
    oxc?: boolean | Omit<IsolatedDeclarationsOptions, "sourcemap">;

    // #region TypeScript Go

    /**
     * **[Experimental]** Enables DTS generation using `tsgo`.
     *
     * To use this option, make sure `@typescript/native-preview` is installed as a dependency.
     *
     * **Note:** This option is not yet recommended for production environments.
     * `tsconfigRaw` and `isolatedDeclarations` options will be ignored when this option is enabled.
     *
     * Pass `true` to use the bundled tsgo binary, or an object with `path` to specify a custom binary path.
     */
    tsgo?: boolean | { path?: string };
}

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;
type MarkPartial<T, K extends keyof T> = Omit<Required<T>, K> & Partial<Pick<T, K>>;

export type OptionsResolved = Overwrite<
    MarkPartial<Omit<Options, "compilerOptions">, "banner" | "footer">,
    {
        exclude: FilterPattern;
        include: FilterPattern;
        oxc: IsolatedDeclarationsOptions | false;
        tsconfig?: string;
        tsconfigRaw: TsConfigJson;
        tsgo: { path?: string } | false;
    }
>;

let warnedTsgo = false;

type RawTsconfig = {
    [key: string]: unknown;
    compilerOptions?: {
        [key: string]: unknown;
        incremental?: boolean;
        tsBuildInfoFile?: string;
    };
    extends?: string | string[];
};

type IncrementalCheck = -1 | 0 | 1;

const checkCompilerOptionsIncremental = (compilerOptions: RawTsconfig["compilerOptions"]): IncrementalCheck => {
    if (!compilerOptions) {
        return 0;
    }

    // Explicit opt-out wins anywhere in the chain.
    if (compilerOptions.incremental === false) {
        return -1;
    }

    if (compilerOptions.incremental === true || typeof compilerOptions.tsBuildInfoFile === "string") {
        return 1;
    }

    return 0;
};

const resolveExtendedTsconfigPath = (extend: string, baseDirectory: string): string | undefined => {
    if (extend.startsWith(".")) {
        return path.resolve(baseDirectory, extend.endsWith(".json") ? extend : `${extend}.json`);
    }

    // Resolve bare specifiers (e.g. `@tsconfig/node20/tsconfig.json`) via
    // node's resolver, scoped to the importing tsconfig's directory.
    // Failures are ignored; the chain is best-effort.
    try {
        return createRequire(path.join(baseDirectory, "package.json")).resolve(extend);
    } catch {
        return undefined;
    }
};

const readTsconfigFile = (p: string): string | undefined => {
    if (existsSync(p)) {
        return ts.sys.readFile(p);
    }

    return undefined;
};

// Detects *explicit* user intent to persist build info to disk by reading raw
// tsconfig JSON (via `ts.readConfigFile`, which skips TypeScript's compiler-option
// normalization — unlike `@visulima/tsconfig.readTsConfig`, which auto-adds
// `incremental: true` when `composite: true` is set). Walks the `extends` chain
// and checks each layer for a user-authored `incremental` / `tsBuildInfoFile`.
//
// Returns `true` iff any layer explicitly sets `compilerOptions.incremental === true`
// OR a `compilerOptions.tsBuildInfoFile` string. `incremental: false` anywhere in
// the chain wins over later `true` values from extensions (user explicit opt-out).
const hasExplicitIncrementalInTsconfig = (tsconfigPath: string, seen = new Set<string>()): boolean => {
    if (seen.has(tsconfigPath)) {
        return false;
    }

    seen.add(tsconfigPath);

    const result = ts.readConfigFile(tsconfigPath, readTsconfigFile);

    if (result.error || !result.config) {
        return false;
    }

    const config = result.config as RawTsconfig;
    const directCheck = checkCompilerOptionsIncremental(config.compilerOptions);

    if (directCheck !== 0) {
        return directCheck === 1;
    }

    if (!config.extends) {
        return false;
    }

    const extendsList = Array.isArray(config.extends) ? config.extends : [config.extends];
    const baseDirectory = path.dirname(tsconfigPath);

    for (const extend of extendsList) {
        if (typeof extend !== "string") {
            continue;
        }

        const extendedPath = resolveExtendedTsconfigPath(extend, baseDirectory);

        if (extendedPath && hasExplicitIncrementalInTsconfig(extendedPath, seen)) {
            return true;
        }
    }

    return false;
};

const resolveTsconfigPath = (
    tsconfigOption: string | boolean | undefined,
    cwd: string,
): { resolvedTsconfig: TsConfigJsonResolved | undefined; tsconfig: string | undefined } => {
    if (tsconfigOption === true || tsconfigOption === undefined) {
        try {
            const result = findTsConfigSync(cwd);

            return { resolvedTsconfig: result.config, tsconfig: result.path };
        } catch {
            return { resolvedTsconfig: undefined, tsconfig: undefined };
        }
    }

    if (typeof tsconfigOption === "string") {
        const resolved = path.resolve(cwd || process.cwd(), tsconfigOption);

        return { resolvedTsconfig: readTsConfig(resolved), tsconfig: resolved };
    }

    return { resolvedTsconfig: undefined, tsconfig: undefined };
};

const validateTsgoCompatibility = (tsgo: false | { path?: string }, vue: boolean, tsMacro: boolean, oxc: unknown): void => {
    if (!tsgo) {
        return;
    }

    if (vue) {
        throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with the `vue` option. Please disable one of them.");
    }

    if (tsMacro) {
        throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with the `tsMacro` option. Please disable one of them.");
    }

    if (oxc) {
        throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with the `oxc` option. Please disable one of them.");
    }
};

const validateOxcCompatibility = (oxc: IsolatedDeclarationsOptions | false, vue: boolean, tsMacro: boolean): void => {
    if (!oxc) {
        return;
    }

    if (vue) {
        throw new Error("[@visulima/rollup-plugin-dts] The `oxc` option is not compatible with the `vue` option. Please disable one of them.");
    }

    if (tsMacro) {
        throw new Error("[@visulima/rollup-plugin-dts] The `oxc` option is not compatible with the `tsMacro` option. Please disable one of them.");
    }
};

// eslint-disable-next-line sonarjs/function-return-type -- the union return is the documented public contract
const normalizeTsgo = (tsgoOption: boolean | { path?: string }): false | { path?: string } => {
    if (tsgoOption === false) {
        return false;
    }

    return tsgoOption === true ? {} : tsgoOption;
};

const normalizeOxc = (
    oxcOption: boolean | Omit<IsolatedDeclarationsOptions, "sourcemap"> | undefined,
    compilerOptions: TsConfigJson.CompilerOptions,
    vue: boolean,
    tsgo: false | { path?: string },
    tsMacro: boolean,
): IsolatedDeclarationsOptions | false => {
    let oxcResolved: IsolatedDeclarationsOptions | false;

    switch (oxcOption) {
        case false: {
            oxcResolved = false;
            break;
        }
        case true: {
            oxcResolved = {};
            break;
        }
        case undefined: {
            oxcResolved = compilerOptions.isolatedDeclarations && !vue && !tsgo && !tsMacro ? {} : false;
            break;
        }
        default: {
            oxcResolved = oxcOption;
        }
    }

    if (oxcResolved) {
        oxcResolved.stripInternal ??= compilerOptions.stripInternal ?? false;
        oxcResolved.sourcemap = compilerOptions.declarationMap ?? false;
    }

    return oxcResolved;
};

export const resolveOptions = ({
    banner,
    // tsc
    build = false,
    cjsDefault = false,
    compilerOptions: userCompilerOptions = {},
    cwd = process.cwd(),
    dtsInput = false,
    eager = false,
    emitDtsOnly = false,
    emitJs: emitJsOption,
    exclude,
    footer,
    include,
    incremental: incrementalOption = false,
    newContext = false,
    oxc: oxcOption,

    parallel = false,
    resolve = false,
    resolver = "oxc",
    sideEffects = false,
    sourcemap: sourcemapOption,
    tsconfig: tsconfigOption,
    tsconfigRaw: overriddenTsconfigRaw = {},
    tsgo: tsgoOption = false,

    tsMacro = false,
    vue = false,
}: Options): OptionsResolved => {
    const { resolvedTsconfig, tsconfig } = resolveTsconfigPath(tsconfigOption, cwd);

    // Capture user's plugin-level compilerOptions BEFORE merging with the resolved
    // tsconfig — needed below to honor explicit incremental opt-in via the plugin
    // option without confusing it with the `composite ??= incremental` auto-fill.
    const pluginCompilerOptions = userCompilerOptions;

    const compilerOptions = {
        ...resolvedTsconfig?.compilerOptions,
        ...userCompilerOptions,
    };

    // Disk-writing incremental mode is opt-in. Trigger only on signals that reflect
    // *user intent*, not parser-normalized defaults:
    //   1. The plugin's own `compilerOptions.incremental` / `tsBuildInfoFile`
    //      (explicitly passed to dts()).
    //   2. An explicit `incremental: true` / `tsBuildInfoFile` in the tsconfig
    //      file's raw JSON (or any of its `extends` ancestors).
    //
    // We can't trust the merged `compilerOptions.incremental` because both
    // TypeScript's parser and `@visulima/tsconfig` auto-add `incremental: true`
    // whenever `composite: true` is set, which would otherwise force every
    // composite project into disk mode and leave `.tsbuildinfo` files behind.
    const incremental
        = incrementalOption
            || pluginCompilerOptions.incremental === true
            || typeof pluginCompilerOptions.tsBuildInfoFile === "string"
            || (typeof tsconfig === "string" && hasExplicitIncrementalInTsconfig(tsconfig));
    const sourcemap = sourcemapOption ?? Boolean(compilerOptions.declarationMap);

    compilerOptions.declarationMap = sourcemap;

    const tsconfigRaw = {
        ...resolvedTsconfig,
        ...overriddenTsconfigRaw,
        compilerOptions,
    };

    // Normalize tsgo: true → {} so downstream code can always treat it as an object or false.
    const tsgo = normalizeTsgo(tsgoOption);
    const oxcResolved = normalizeOxc(oxcOption, compilerOptions, vue, tsgo, tsMacro);

    const emitJs = emitJsOption ?? (compilerOptions.checkJs ?? compilerOptions.allowJs ?? false);

    validateTsgoCompatibility(tsgo, vue, tsMacro, oxcResolved);
    validateOxcCompatibility(oxcResolved, vue, tsMacro);

    if (tsgo && !warnedTsgo) {
        // eslint-disable-next-line no-console -- user-facing warning is the intended UX for an experimental option
        console.warn("The `tsgo` option is experimental and may change in the future.");
        warnedTsgo = true;
    }

    return {
        banner,
        // tsc
        build,
        cjsDefault,
        cwd,
        dtsInput,
        eager,
        emitDtsOnly,
        emitJs,
        exclude,
        footer,
        include,
        incremental,
        newContext,
        oxc: oxcResolved,

        parallel,
        resolve,
        resolver,
        sideEffects,
        sourcemap,
        tsconfig,
        tsconfigRaw,
        tsgo,

        tsMacro,
        vue,
    };
};
