/* eslint-disable import/exports-last -- exports are intentionally interleaved with helper code by topic */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { TsConfigJson, TsConfigJsonResolved } from "@visulima/tsconfig";
import { findTsConfigSync, readTsConfig } from "@visulima/tsconfig";
import type { IsolatedDeclarationsOptions } from "oxc-transform";
import type { RenderedChunk } from "rollup";
// TypeScript 7 (the native/tsgo compiler) ships only a minimal, ESM API: the default
// `typescript` export is version info, and the classic synchronous surface
// (`ts.sys`, `ts.readConfigFile`, `ts.createProgram`, …) does not exist. This module runs
// on *every* resolve regardless of the chosen generator, so it must not hard-depend on
// that surface — every use below is feature-checked. The `tsc` backend, which genuinely
// needs the classic API, is loaded lazily and only when `generator === 'tsc'`.
import ts from "typescript";

import type { CustomLanguage } from "./custom-language";
import { isVolarLanguage, LanguageContext, resolveCustomLanguages } from "./custom-language";
import type { VueLanguageOptions } from "./tsc/vue";
import { isTS70Installed } from "./tsgo";

type AddonFunction = (chunk: RenderedChunk) => string | Promise<string>;

export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | undefined;

/** The generator used to produce `.d.ts` files. */
export type Generator = "oxc" | "tsc" | "tsgo";

export interface Logger {
    error: (...args: any[]) => void;

    info: (...args: any[]) => void;

    warn: (...args: any[]) => void;
}

export interface TsgoOptions {
    /**
     * Enable or disable DTS generation using `tsgo`.
     */
    enabled?: boolean;

    /**
     * Custom path to the `tsgo` binary.
     */
    path?: string;

    /**
     * Allow tsgo to run the `contentMappers` configured in tsconfig (external processes that
     * supply declarations for non-TypeScript files). Mappers execute code from the project's
     * dependencies, so this is off unless set. Requires TypeScript 7.1 or later.
     * @default false
     */
    runExternalCode?: boolean;
}

// #region General Options
export interface GeneralOptions {
    /**
     * If `true`, type errors in the sources are reported and fail the build instead of being ignored.
     *
     * - `tsc`: the emitted file's syntactic and semantic errors (in `build` mode, every error the project build reports) fail the build.
     * - `tsgo`: the compiler runs with type-checking enabled and a non-zero exit fails the build.
     * - `oxc`: no effect. Isolated declarations do not type-check, so a warning is logged instead.
     * @default false
     */
    check?: boolean;

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
     * Glob pattern(s) to filter which entry files get `.d.ts` generation.
     *
     * When specified, only rollup-detected entry points matching these patterns
     * will emit `.d.ts` chunks. When not specified, all entries get `.d.ts`
     * generation. This *filters* the existing entry set — it never promotes a
     * non-entry (internal/transitive) module to an entry, so a broad pattern
     * like `'**'` still only affects real entry points.
     *
     * Supports negation patterns (e.g. `['**', '!src/icons/**']`) for exclusion.
     * Patterns are matched against file paths relative to `cwd` (use forward
     * slashes).
     *
     * **Note:** this option has no effect in `dtsInput` mode, and when using the
     * `tsc`/`vue-tsc` backend it also narrows the set of root files passed to the
     * compiler.
     * @example
     * entry: 'src/index.ts'
     * entry: ['src/*.ts', '!src/internal/**']
     */
    entry?: string | string[];

    /**
     * A pattern (or array of patterns) specifying files to exclude from DTS generation.
     * Files matching this pattern will be skipped by the transform hook and will not have
     * `.d.ts` files generated.
     *
     * Accepts minimatch glob patterns, regular expressions, or arrays of either.
     */
    exclude?: Exclude<FilterPattern, undefined>;

    /**
     * The generator used to produce `.d.ts` files.
     *
     * - `'tsc'`: The TypeScript 5.x/6.x compiler. Supports all TypeScript features.
     * - `'oxc'`: Oxc's isolated declaration generator. Much faster than `tsc`, but only supports code that satisfies [`isolatedDeclarations`](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations).
     * - `'tsgo'`: **[Experimental]** The TypeScript Go compiler. May not support all TypeScript features yet.
     *
     * When unset, the generator is inferred:
     * - `'tsc'` whenever {@link TscOptions.vue vue} or {@link TscOptions.tsMacro tsMacro} is enabled.
     * - `'tsgo'` if {@link Options.tsgo tsgo} options are provided.
     * - `'oxc'` if {@link Options.oxc oxc} options are provided, or `isolatedDeclarations` is enabled in `compilerOptions`.
     * - `'tsgo'` if TypeScript 7 (or `@typescript/native-preview`) is installed.
     * - `'tsc'` otherwise.
     * @default 'tsc'
     */
    generator?: Generator;

    /**
     * A pattern (or array of patterns) specifying files to include in DTS generation.
     * Only files matching this pattern will have `.d.ts` files generated.
     *
     * By default, all TypeScript and Vue files are included.
     * Accepts minimatch glob patterns, regular expressions, or arrays of either.
     */
    include?: Exclude<FilterPattern, undefined>;

    /**
     * Logger used for user-facing diagnostics (experimental-feature warnings, the compiler
     * version banner). Defaults to the global `console`.
     */
    logger?: Logger;

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
     *
     * This is a shortcut for a preconfigured entry in {@link Options.customLanguages}, and requires the `tsc` generator.
     */
    tsMacro?: boolean;

    /**
     * If `true`, the plugin will generate `.d.ts` files using `vue-tsc`.
     *
     * Pass an object to override `vueCompilerOptions`. The overrides are merged over the `vueCompilerOptions` found in the tsconfig.
     *
     * This is a shortcut for a preconfigured entry in {@link Options.customLanguages}, and requires the `tsc` generator.
     */
    vue?: boolean | VueLanguageOptions;
}

export interface Options extends GeneralOptions, TscOptions {
    /**
     * Registers non-standard source languages, such as Vue or Astro.
     *
     * A language that is supported through Volar needs both `volarTypeScript` and `createVolarPlugins`; it requires the `tsc` generator.
     * A language without Volar also works with the `oxc` generator. The `tsgo` generator does not support custom languages.
     *
     * Custom languages run in the main process, so the `parallel` option is ignored when any are set.
     * @experimental
     */
    customLanguages?: CustomLanguage[];

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
     * `tsconfigRaw` and `compilerOptions` are applied (written to a temporary project that
     * extends your `tsconfig.json`), but `isolatedDeclarations` is ignored — it is an oxc-only concept.
     *
     * Pass `true` to use the bundled tsgo binary, or an object with `path` to specify a custom binary path.
     */
    tsgo?: boolean | TsgoOptions;
}

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;
type MarkPartial<T, K extends keyof T> = Omit<Required<T>, K> & Partial<Pick<T, K>>;

export type OptionsResolved = Overwrite<
    MarkPartial<Omit<Options, "compilerOptions">, "banner" | "footer">,
    {
        entry?: string[];
        exclude: FilterPattern;
        generator: Generator;
        include: FilterPattern;
        languageContext: LanguageContext;
        logger: Logger;
        oxc: IsolatedDeclarationsOptions | false;
        tsconfig?: string;
        tsconfigChainKey: string | undefined;
        tsconfigRaw: TsConfigJson;
        tsgo: false | Pick<TsgoOptions, "path" | "runExternalCode">;
    }
>;

let isWarnedTsgo = false;

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
        try {
            const content = readFileSync(p, "utf8");

            // The classic compiler's `ts.sys.readFile` strips a leading UTF-8 BOM before
            // handing the text to `ts.readConfigFile`; `readFileSync` does not. Strip it here
            // so a BOM-prefixed tsconfig parses identically under both compilers.
            return content.codePointAt(0) === 0xfe_ff ? content.slice(1) : content;
        } catch {
            return undefined;
        }
    }

    return undefined;
};

// `ts.readConfigFile` is a JSONC parser that only exists on the classic (TS 5/6) compiler.
// It is `undefined` on the TS 7 native compiler.
const canReadTsconfig = (): boolean => typeof (ts as { readConfigFile?: unknown }).readConfigFile === "function";

// Detects *explicit* user intent to persist build info to disk by reading raw
// tsconfig JSON (via `ts.readConfigFile`, which skips TypeScript's compiler-option
// normalization — unlike `@visulima/tsconfig.readTsConfig`, which auto-adds
// `incremental: true` when `composite: true` is set). Walks the `extends` chain
// and checks each layer for a user-authored `incremental` / `tsBuildInfoFile`.
//
// Returns `true` iff any layer explicitly sets `compilerOptions.incremental === true`
// OR a `compilerOptions.tsBuildInfoFile` string. `incremental: false` anywhere in
// the chain wins over later `true` values from extensions (user explicit opt-out).
//
// While the chain is walked, the path and raw content of every layer are fed into `hasher` (see `readTsconfigChain`).
const walkTsconfigChain = (tsconfigPath: string, hasher: ReturnType<typeof createHash>, seen: Set<string>): boolean => {
    if (seen.has(tsconfigPath)) {
        return false;
    }

    // `incremental` is a disk-writing feature of the classic `tsc` backend only; it has no
    // effect under the oxc or tsgo generators. On the TS 7 native compiler — where the tsc
    // backend cannot run anyway — there is nothing to detect, so skip.
    if (!canReadTsconfig()) {
        return false;
    }

    seen.add(tsconfigPath);

    const result = ts.readConfigFile(tsconfigPath, readTsconfigFile);

    if (result.error || !result.config) {
        return false;
    }

    // The path keeps two layers with identical content apart; the content makes an edit to any
    // layer change the key, including a field the merged configuration drops (such as `references`).
    hasher.update(tsconfigPath).update("\0").update(JSON.stringify(result.config));

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

        if (extendedPath && walkTsconfigChain(extendedPath, hasher, seen)) {
            return true;
        }
    }

    return false;
};

interface TsconfigChain {
    /** Whether a layer opts into a disk-writing incremental build (see `walkTsconfigChain`). */
    explicitIncremental: boolean;
    /** Hash of the path and the raw content of every file in the chain. */
    key: string;
}

/**
 * Reads the `extends` chain of a tsconfig file: the hash of the files it is made of, and whether one of them opts into
 * incremental builds.
 *
 * `readTsConfig` merges the chain into the values it returns, and those merged values are part of the program cache key, so
 * the hash is what makes the key follow the chain files themselves: an edit to a layer whose fields the merge drops (such as
 * `references`) or normalizes away changes it, where the merged values alone would not.
 *
 * Returns `undefined` when the chain cannot be read, either because the tsconfig is not a file or because the classic
 * compiler API (`ts.readConfigFile`, a JSONC reader) is not installed.
 */
const readTsconfigChain = (tsconfigPath: string): TsconfigChain | undefined => {
    if (!canReadTsconfig()) {
        return undefined;
    }

    const hasher = createHash("sha256");

    return { explicitIncremental: walkTsconfigChain(tsconfigPath, hasher, new Set()), key: hasher.digest("hex") };
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

const validateTsgoCompatibility = (tsgo: boolean, vue: boolean, tsMacro: boolean, oxc: boolean): void => {
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

const validateOxcCompatibility = (oxc: boolean, vue: boolean, tsMacro: boolean): void => {
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

const validateGenerator = (generator: Generator, logger: Logger): void => {
    if (generator === "tsc") {
        // The `tsc` backend uses the classic synchronous compiler API (`ts.sys`,
        // `ts.createProgram`, …). TypeScript 7 (the native compiler) ships `typescript` but
        // not that surface, so loading the backend would throw a cryptic `ts.sys is undefined`
        // TypeError. Fail fast with an actionable message (auto-selection already prefers `tsgo`
        // under TS7; this only triggers when `generator: "tsc"` was requested explicitly).
        if (isTS70Installed()) {
            throw new Error(
                "[@visulima/rollup-plugin-dts] The `tsc` generator requires the classic TypeScript compiler API, which TypeScript 7 (the native compiler) does not provide. Use the `tsgo` generator (the default under TypeScript 7) or `oxc` instead.",
            );
        }

        try {
            createRequire(import.meta.url).resolve("typescript");
        } catch {
            throw new Error(
                "[@visulima/rollup-plugin-dts] TypeScript is not installed. Install the `typescript` package, or enable `isolatedDeclarations` in your `tsconfig.json` to use Oxc instead.",
            );
        }

        return;
    }

    // TypeScript 7 is stable; only the `@typescript/native-preview` build is still a preview.
    if (generator === "tsgo" && !isTS70Installed() && !isWarnedTsgo) {
        isWarnedTsgo = true;
        logger.warn(
            "[@visulima/rollup-plugin-dts] The `tsgo` generator runs on the `@typescript/native-preview` build, which is experimental: some options (such as `isolatedDeclarations`) are unavailable. Install `typescript@7` for the stable compiler.",
        );
    }
};

// eslint-disable-next-line sonarjs/function-return-type -- the union return is the documented public contract
const normalizeTsgo = (tsgoOption: boolean | TsgoOptions): false | Pick<TsgoOptions, "path" | "runExternalCode"> => {
    if (tsgoOption === false) {
        return false;
    }

    if (tsgoOption === true) {
        return {};
    }

    // Object form: an explicit `enabled: false` disables tsgo entirely.
    if (tsgoOption.enabled === false) {
        return false;
    }

    return { path: tsgoOption.path, ...(tsgoOption.runExternalCode !== undefined && { runExternalCode: tsgoOption.runExternalCode }) };
};

/**
 * Whether the user asked for oxc, either explicitly or implicitly via `isolatedDeclarations`.
 * This is about *intent* — the generator that actually runs is decided by {@link resolveGenerator}.
 */
const isOxcRequested = (
    oxcOption: boolean | Omit<IsolatedDeclarationsOptions, "sourcemap"> | undefined,
    compilerOptions: TsConfigJson.CompilerOptions,
): boolean => {
    if (oxcOption === false) {
        return false;
    }

    if (oxcOption === undefined) {
        return Boolean(compilerOptions.isolatedDeclarations);
    }

    return true;
};

const applyOxcDefaults = (
    oxcOption: boolean | Omit<IsolatedDeclarationsOptions, "sourcemap"> | undefined,
    compilerOptions: TsConfigJson.CompilerOptions,
): IsolatedDeclarationsOptions => {
    const oxcResolved: IsolatedDeclarationsOptions = typeof oxcOption === "object" ? oxcOption : {};

    // `stripInternal` is a real tsconfig compiler option, but TsConfigJson.CompilerOptions
    // does not model it (TypeScript marks it internal), so widen to read it.
    const { stripInternal } = compilerOptions as TsConfigJson.CompilerOptions & { stripInternal?: boolean };

    oxcResolved.stripInternal ??= stripInternal ?? false;
    oxcResolved.sourcemap = compilerOptions.declarationMap ?? false;

    return oxcResolved;
};

const validateCustomLanguageCompatibility = ({
    generator,
    languageContext,
    oxc,
    tsgo,
}: {
    generator: Generator | undefined;
    languageContext: LanguageContext;
    oxc: boolean;
    tsgo: boolean;
}): void => {
    if (languageContext.isUsingVolar()) {
        if (tsgo) {
            throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` option is not compatible with Volar-based custom languages. Please disable one of them.");
        }

        if (oxc) {
            throw new Error("[@visulima/rollup-plugin-dts] The `oxc` option is not compatible with Volar-based custom languages. Please disable one of them.");
        }

        return;
    }

    if (languageContext.languages.length > 0 && (tsgo || generator === "tsgo")) {
        throw new Error("[@visulima/rollup-plugin-dts] The `tsgo` generator does not support custom languages. Use the `tsc` or `oxc` generator instead.");
    }
};

// Volar-based languages hook into the classic compiler API, which TypeScript 7 does not ship. This runs
// before the languages are resolved, because the `vue` and `tsMacro` shortcuts load their Volar tooling
// while being created.
const assertVolarRuntimeAvailable = ({
    customLanguages,
    tsMacro,
    vue,
}: {
    customLanguages: CustomLanguage[];
    tsMacro: boolean;
    vue: boolean | VueLanguageOptions;
}): void => {
    const hasVolarCustomLanguage = customLanguages.some((language) => isVolarLanguage(language));

    if (!(vue || tsMacro || hasVolarCustomLanguage) || !isTS70Installed()) {
        return;
    }

    throw new Error(
        hasVolarCustomLanguage
            ? "[@visulima/rollup-plugin-dts] The `vue`, `tsMacro` and Volar-based `customLanguages` options need the classic TypeScript compiler API, which TypeScript 7 does not provide. Use TypeScript 6 for these options."
            : "[@visulima/rollup-plugin-dts] The `vue` and `tsMacro` options need the classic TypeScript compiler API, which TypeScript 7 does not provide. Use TypeScript 6 for these options.",
    );
};

const resolveGenerator = (
    explicit: Generator | undefined,
    oxcRequested: boolean,
    tsgoRequested: boolean,
    languageContext: LanguageContext,
    customLanguages: CustomLanguage[],
    logger: Logger,
): Generator => {
    // Volar-based backends (Vue / ts-macro / custom Volar languages) hook into the TypeScript
    // compiler API, so they can only run under `tsc`.
    if (languageContext.isUsingVolar()) {
        if (explicit && explicit !== "tsc") {
            if (customLanguages.some((language) => isVolarLanguage(language))) {
                throw new Error(
                    `[@visulima/rollup-plugin-dts] Volar-based custom languages require the \`tsc\` generator; the \`generator: '${explicit}'\` option is not compatible with them.`,
                );
            }

            logger.warn(
                `[@visulima/rollup-plugin-dts] The \`vue\`/\`tsMacro\` option requires the \`tsc\` generator; the \`generator: '${explicit}'\` option is ignored.`,
            );
        }

        return "tsc";
    }

    if (explicit) {
        return explicit;
    }

    if (tsgoRequested) {
        return "tsgo";
    }

    if (oxcRequested) {
        return "oxc";
    }

    // TypeScript 7 ships the native Go compiler as `typescript` itself; prefer it over the
    // (much slower) JS compiler when it is what the user has installed.
    if (isTS70Installed()) {
        if (languageContext.languages.length > 0) {
            throw new Error(
                "[@visulima/rollup-plugin-dts] TypeScript 7 is installed, but the `tsgo` generator does not support custom languages. Enable `isolatedDeclarations` or set `generator: 'oxc'` to use Oxc instead, or install TypeScript 6.0 or below.",
            );
        }

        return "tsgo";
    }

    return "tsc";
};

export const resolveOptions = ({
    banner,
    // tsc
    build = false,
    check = false,
    cjsDefault = false,
    compilerOptions: userCompilerOptions = {},
    customLanguages = [],
    cwd = process.cwd(),
    dtsInput = false,
    eager = false,
    emitDtsOnly = false,
    emitJs: emitJsOption,
    entry,
    exclude,
    footer,
    generator: generatorOption,
    include,
    incremental: incrementalOption = false,
    logger = console,
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
    const tsconfigChain = tsconfig === undefined ? undefined : readTsconfigChain(tsconfig);
    const isIncremental =
        incrementalOption
        || pluginCompilerOptions.incremental === true
        || typeof pluginCompilerOptions.tsBuildInfoFile === "string"
        || tsconfigChain?.explicitIncremental === true;
    const isSourcemap = sourcemapOption ?? Boolean(compilerOptions.declarationMap);

    compilerOptions.declarationMap = isSourcemap;

    let resolvedEntry: string[] | undefined;

    if (entry !== undefined) {
        const entryList = Array.isArray(entry) ? entry : [entry];

        // An empty pattern list can never match anything; treat it as "unset" so the
        // build falls back to rollup's entry detection instead of silently emitting
        // zero declaration files.
        resolvedEntry = entryList.length > 0 ? entryList : undefined;
    }

    const tsconfigRaw = {
        ...resolvedTsconfig,
        ...overriddenTsconfigRaw,
        compilerOptions,
    };

    // Normalize tsgo: true → {} so downstream code can always treat it as an object or false.
    const tsgoNormalized = normalizeTsgo(tsgoOption);
    const oxcRequested = isOxcRequested(oxcOption, compilerOptions);

    // Volar-based languages hook into the classic compiler API, which TypeScript 7 does not ship.
    // This runs before the languages are resolved, because the `vue` and `tsMacro` shortcuts load
    // their Volar tooling while being created.
    assertVolarRuntimeAvailable({ customLanguages, tsMacro, vue });

    const languageContext = new LanguageContext(resolveCustomLanguages({ customLanguages, tsMacro, vue }));

    // Conflicting *explicit* options are an error rather than something we silently drop,
    // so validate the requested intent before the generator collapses it to one backend.
    validateTsgoCompatibility(tsgoNormalized !== false, Boolean(vue), tsMacro, oxcRequested);
    validateOxcCompatibility(oxcRequested, Boolean(vue), tsMacro);
    validateCustomLanguageCompatibility({
        generator: generatorOption,
        languageContext,
        oxc: oxcRequested,
        tsgo: tsgoNormalized !== false,
    });

    const generator = resolveGenerator(generatorOption, oxcRequested, tsgoNormalized !== false, languageContext, customLanguages, logger);

    validateGenerator(generator, logger);

    if (check && generator === "oxc") {
        logger.warn("[@visulima/rollup-plugin-dts] The `check` option has no effect with the `oxc` generator (isolated declarations are not type-checked).");
    }

    // Exactly one backend runs. Collapsing the other to `false` here keeps the single
    // source of truth in `generator` while leaving the downstream `if (tsgo) … else if (oxc)`
    // dispatch (and the resolved option objects it reads) working unchanged.
    const oxcResolved = generator === "oxc" ? applyOxcDefaults(oxcOption, compilerOptions) : false;
    const tsgo = generator === "tsgo" ? tsgoNormalized || {} : false;

    // `checkJs` and `allowJs` independently justify emitting declarations for
    // `.js` sources, so this is an OR — not a `??` precedence chain. An explicit
    // `checkJs: false` (e.g. a consumer disabling JS type-checking to "avoid
    // extra work") must not veto `allowJs: true`, which still requires `.js`
    // declarations to be emitted.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `||` is intentional: this is boolean OR semantics (either flag enables JS emit), not a null/undefined fallback; `??` would let an explicit `checkJs: false` veto `allowJs: true`.
    const isEmitJs = emitJsOption ?? Boolean(compilerOptions.checkJs || compilerOptions.allowJs);

    // Custom languages are functions, which cannot be sent to the forked tsc worker, so a build that
    // uses them runs in-process.
    if (parallel && customLanguages.length > 0) {
        logger.warn("[@visulima/rollup-plugin-dts] The `parallel` option is ignored when `customLanguages` are set; the build runs in-process.");
    }

    return {
        banner,
        // tsc
        build,
        check,
        cjsDefault,
        customLanguages,
        cwd,
        dtsInput,
        eager,
        emitDtsOnly,
        emitJs: isEmitJs,
        entry: resolvedEntry,
        exclude,
        footer,
        generator,
        include,
        incremental: isIncremental,
        languageContext,
        logger,
        newContext,
        oxc: oxcResolved,

        parallel: parallel && customLanguages.length === 0,
        resolve,
        resolver,
        sideEffects,
        sourcemap: isSourcemap,
        tsconfig,
        tsconfigChainKey: tsconfigChain?.key,
        tsconfigRaw,
        tsgo,

        tsMacro,
        vue,
    };
};
