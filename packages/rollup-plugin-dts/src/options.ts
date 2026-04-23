import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { TsConfigJson, TsConfigJsonResolved } from "@visulima/tsconfig";
import { findTsConfigSync, readTsConfig } from "@visulima/tsconfig";
import ts from "typescript";
import type { IsolatedDeclarationsOptions } from "oxc-transform";
import type { AddonFunction } from "rollup";

export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | null;

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
     * A pattern (or array of patterns) specifying files to exclude from DTS generation.
     * Files matching this pattern will be skipped by the transform hook and will not have
     * `.d.ts` files generated.
     *
     * Accepts minimatch glob patterns, regular expressions, or arrays of either.
     */
    exclude?: FilterPattern;

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
    compilerOptions?: {
        incremental?: boolean;
        tsBuildInfoFile?: string;
        [key: string]: unknown;
    };
    extends?: string | string[];
    [key: string]: unknown;
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

    const result = ts.readConfigFile(tsconfigPath, (p) => (existsSync(p) ? ts.sys.readFile(p) : undefined));

    if (result.error || !result.config) {
        return false;
    }

    const config = result.config as RawTsconfig;
    const compilerOptions = config.compilerOptions;

    if (compilerOptions) {
        // Explicit opt-out wins anywhere in the chain.
        if (compilerOptions.incremental === false) {
            return false;
        }

        if (compilerOptions.incremental === true || typeof compilerOptions.tsBuildInfoFile === "string") {
            return true;
        }
    }

    if (!config.extends) {
        return false;
    }

    const extendsList = Array.isArray(config.extends) ? config.extends : [config.extends];
    const baseDir = path.dirname(tsconfigPath);

    for (const extend of extendsList) {
        if (typeof extend !== "string") {
            continue;
        }

        let extendedPath: string | undefined;

        if (extend.startsWith(".")) {
            extendedPath = path.resolve(baseDir, extend.endsWith(".json") ? extend : `${extend}.json`);
        } else {
            // Resolve bare specifiers (e.g. `@tsconfig/node20/tsconfig.json`) via
            // node's resolver, scoped to the importing tsconfig's directory.
            // Failures are ignored; the chain is best-effort.
            try {
                extendedPath = createRequire(path.join(baseDir, "package.json")).resolve(extend);
            } catch {
                extendedPath = undefined;
            }
        }

        if (extendedPath && hasExplicitIncrementalInTsconfig(extendedPath, seen)) {
            return true;
        }
    }

    return false;
};

export const resolveOptions = ({
    banner,
    // tsc
    build = false,
    cjsDefault = false,
    compilerOptions = {},
    cwd = process.cwd(),
    dtsInput = false,
    eager = false,
    emitDtsOnly = false,
    emitJs,
    exclude = null,
    footer,
    include = null,
    incremental = false,
    newContext = false,
    oxc,

    parallel = false,
    resolve = false,
    resolver = "oxc",
    sideEffects = false,
    sourcemap,
    tsconfig,
    tsconfigRaw: overriddenTsconfigRaw = {},
    tsgo: tsgoOption = false,

    tsMacro = false,
    vue = false,
}: Options): OptionsResolved => {
    let resolvedTsconfig: TsConfigJsonResolved | undefined;

    if (tsconfig === true || tsconfig == undefined) {
        try {
            const result = findTsConfigSync(cwd);

            tsconfig = result.path;
            resolvedTsconfig = result.config;
        } catch {
            tsconfig = undefined;
        }
    } else if (typeof tsconfig === "string") {
        tsconfig = path.resolve(cwd || process.cwd(), tsconfig);
        resolvedTsconfig = readTsConfig(tsconfig);
    } else {
        tsconfig = undefined;
    }

    // Capture user's plugin-level compilerOptions BEFORE merging with the resolved
    // tsconfig — needed below to honor explicit incremental opt-in via the plugin
    // option without confusing it with the `composite ??= incremental` auto-fill.
    const pluginCompilerOptions = compilerOptions;

    compilerOptions = {
        ...resolvedTsconfig?.compilerOptions,
        ...compilerOptions,
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
    incremental ||= pluginCompilerOptions.incremental === true
        || typeof pluginCompilerOptions.tsBuildInfoFile === "string"
        || (typeof tsconfig === "string" && hasExplicitIncrementalInTsconfig(tsconfig));
    sourcemap ??= !!compilerOptions.declarationMap;
    compilerOptions.declarationMap = sourcemap;

    const tsconfigRaw = {
        ...resolvedTsconfig,
        ...overriddenTsconfigRaw,
        compilerOptions,
    };

    // Normalize tsgo: true → {} so downstream code can always treat it as an object or false.
    let tsgo: { path?: string } | false = false;

    if (tsgoOption) {
        tsgo = tsgoOption === true ? {} : tsgoOption;
    }

    oxc ??= !!(compilerOptions?.isolatedDeclarations && !vue && !tsgo && !tsMacro);

    if (oxc === true) {
        oxc = {};
    }

    if (oxc) {
        oxc.stripInternal ??= !!compilerOptions?.stripInternal;
        // @ts-expect-error omitted in user options
        oxc.sourcemap = !!compilerOptions.declarationMap;
    }

    emitJs ??= !!(compilerOptions.checkJs || compilerOptions.allowJs);

    if (tsgo) {
        if (vue) {
            throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with the `vue` option. Please disable one of them.");
        }

        if (tsMacro) {
            throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with the `tsMacro` option. Please disable one of them.");
        }

        if (oxc) {
            throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with the `oxc` option. Please disable one of them.");
        }
    }

    if (oxc && vue) {
        throw new Error("[@visulima/rollup-plugin-dts] The `oxc` option is not compatible with the `vue` option. Please disable one of them.");
    }

    if (oxc && tsMacro) {
        throw new Error("[@visulima/rollup-plugin-dts] The `oxc` option is not compatible with the `tsMacro` option. Please disable one of them.");
    }

    if (tsgo && !warnedTsgo) {
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
        oxc,

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
