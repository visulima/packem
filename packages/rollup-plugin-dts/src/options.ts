import path from "node:path";
import process from "node:process";

import type { TsConfigJson, TsConfigJsonResolved } from "get-tsconfig";
import {
    getTsconfig,
    parseTsconfig,
} from "get-tsconfig";
import type { IsolatedDeclarationsOptions } from "rollup/experimental";

export interface Options {
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
     * If `true`, the plugin will prepare all files listed in `tsconfig.json` for `tsc` or `vue-tsc`.
     *
     * This is especially useful when you have a single `tsconfig.json` for multiple projects in a monorepo.
     */
    eager?: boolean;

    /**
     * If `true`, the plugin will emit only `.d.ts` files and remove all other output chunks.
     *
     * This is especially useful when generating `.d.ts` files for the CommonJS format as part of a separate build step.
     */
    emitDtsOnly?: boolean;

    /**
     * If your tsconfig.json has
     * [`references`](https://www.typescriptlang.org/tsconfig/#references) option,
     * `rollup-plugin-dts` will use [`tsc
     * -b`](https://www.typescriptlang.org/docs/handbook/project-references.html#build-mode-for-typescript)
     * to build the project and all referenced projects before emitting `.d.ts`
     * files.
     *
     * In such case, if this option is `true`, `rollup-plugin-dts` will write
     * down all built files into your disk, including
     * [`.tsbuildinfo`](https://www.typescriptlang.org/tsconfig/#tsBuildInfoFile)
     * and other built files. This is equivalent to running `tsc -b` in your
     * project.
     *
     * Otherwise, if this option is `false`, `rollup-plugin-dts` will write
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
     * This option is only used when {@link Options.isolatedDeclarations} is
     * `false`.
     */
    incremental?: boolean;

    /**
     * If `true`, the plugin will generate `.d.ts` files using Oxc,
     * which is significantly faster than the TypeScript compiler.
     *
     * This option is automatically enabled when `isolatedDeclarations` in `compilerOptions` is set to `true`.
     */
    isolatedDeclarations?:
        | boolean
        | Omit<IsolatedDeclarationsOptions, "sourcemap">;

    /**
     * If `true`, the plugin will launch a separate process for `tsc` or `vue-tsc`.
     * This enables processing multiple projects in parallel.
     */
    parallel?: boolean;

    /**
     * Resolve external types used in `.d.ts` files from `node_modules`.
     */
    resolve?: boolean | (string | RegExp)[];

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

    /**
     * **[Experimental]** Enables DTS generation using `tsgo`.
     *
     * To use this option, make sure `@typescript/native-preview` is installed as a dependency.
     *
     * **Note:** This option is not yet recommended for production environments.
     * `tsconfigRaw` and `isolatedDeclarations` options will be ignored when this option is enabled.
     */
    tsgo?: boolean;

    /**
     * If `true`, the plugin will generate `.d.ts` files using `vue-tsc`.
     */
    vue?: boolean;
}

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;

export type OptionsResolved = Overwrite<
  Required<Omit<Options, "compilerOptions">>,
  {
      isolatedDeclarations: IsolatedDeclarationsOptions | false;
      tsconfig: string | undefined;
      tsconfigRaw: TsConfigJson;
  }
>;

let warnedTsgo = false;

export function resolveOptions({
    compilerOptions = {},
    cwd = process.cwd(),
    dtsInput = false,
    eager = false,
    emitDtsOnly = false,
    incremental = false,
    isolatedDeclarations,
    parallel = false,
    resolve = false,
    sourcemap,
    tsconfig,
    tsconfigRaw: overriddenTsconfigRaw = {},
    tsgo = false,
    vue = false,
}: Options): OptionsResolved {
    let resolvedTsconfig: TsConfigJsonResolved | undefined;

    if (tsconfig === true || tsconfig == undefined) {
        const { config, path } = getTsconfig(cwd) || {};

        tsconfig = path;
        resolvedTsconfig = config;
    } else if (typeof tsconfig === "string") {
        tsconfig = path.resolve(cwd || process.cwd(), tsconfig);
        resolvedTsconfig = parseTsconfig(tsconfig);
    } else {
        tsconfig = undefined;
    }

    compilerOptions = {
        ...resolvedTsconfig?.compilerOptions,
        ...compilerOptions,
    };

    incremental
    ||= compilerOptions.incremental || !!compilerOptions.tsBuildInfoFile;
    sourcemap ??= !!compilerOptions.declarationMap;
    compilerOptions.declarationMap = sourcemap;

    const tsconfigRaw = {
        ...resolvedTsconfig,
        ...overriddenTsconfigRaw,
        compilerOptions,
    };

    if (isolatedDeclarations == undefined) {
        isolatedDeclarations = !!compilerOptions?.isolatedDeclarations;
    }

    if (isolatedDeclarations === true) {
        isolatedDeclarations = {};
    }

    if (isolatedDeclarations) {
        isolatedDeclarations.stripInternal ??= !!compilerOptions?.stripInternal;
        // @ts-expect-error omitted in user options
        isolatedDeclarations.sourcemap = !!compilerOptions.declarationMap;
    }

    if (tsgo && !warnedTsgo) {
        console.warn(
            "The `tsgo` option is experimental and may change in the future.",
        );
        warnedTsgo = true;
    }

    return {
        cwd,
        dtsInput,
        eager,
        emitDtsOnly,
        incremental,
        isolatedDeclarations,
        parallel,
        resolve,
        sourcemap,
        tsconfig,
        tsconfigRaw,
        tsgo,
        vue,
    };
}
