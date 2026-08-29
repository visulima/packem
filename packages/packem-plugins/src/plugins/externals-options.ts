import type { RollupAliasOptions } from "@rollup/plugin-alias";

type MaybeFalsy<T> = T | false | null | undefined;

/**
 * User-facing configuration for externals classification, mirrored at
 * `packem.config.ts` → `rollup.resolveExternals`.
 */
export type ResolveExternalsPluginOptions = {
    /**
     * Mark node built-in modules like `path`, `fs`... as external.
     *
     * Set to `false` to use shims/polyfills instead.
     * @default true
     */
    builtins?: boolean;

    /**
     * `node:` prefix handling for imports of Node builtins:
     * - `'add'`    turns `'path'` into `'node:path'`
     * - `'strip'`  turns `'node:path'` into `'path'`
     * - `'ignore'` leaves names as written
     * @default "add"
     */
    builtinsPrefix?: "add" | "ignore" | "strip";

    /**
     * Mark `dependencies` as external.
     * @default true
     */
    deps?: boolean;

    /**
     * Mark `devDependencies` as external.
     * @default false
     */
    devDeps?: boolean;

    /**
     * Patterns whose matching specifiers are forced to be bundled,
     * overriding all other rules (deps/peer/built-ins/etc.).
     *
     * Strings are matched as exact specifiers; RegExp values are tested
     * against the import id. Falsy entries are ignored for convenient
     * conditional configuration.
     * @default [] (no specifier is forcibly bundled)
     */
    exclude?: MaybeFalsy<RegExp | string>[];

    /**
     * Mark `optionalDependencies` as external.
     * @default true
     */
    optDeps?: boolean;

    /**
     * Mark `peerDependencies` as external.
     * @default true
     */
    peerDeps?: boolean;
};

/**
 * Minimal slice of build options consumed by `externalsPlugin`.
 *
 * The plugin lives in `@visulima/packem-rollup` so it can be reused outside
 * of packem core, so it's parameterized over this shape rather than
 * packem's `InternalBuildOptions`. Any options object that satisfies this
 * structural type is accepted.
 */
export type ExternalsBuildOptions = {
    alias?: Record<string, string>;
    externals?: (RegExp | string)[];
    rollup: {
        alias?: RollupAliasOptions | false;
        resolveExternals?: ResolveExternalsPluginOptions;
    };
    rootDir: string;
    sourceDir?: string;
    validation?:
        | false
        | {
              dependencies?:
                  | false
                  | {
                        hoisted?: false | { exclude: string[] };
                    };
          };
};

export type ExternalsPluginOptions = {
    /**
     * Patterns whose types the DTS plugin should inline rather than leaving as
     * external imports. Matched specifiers return `undefined` from resolveId
     * and are added to the `exclude` list for `options.external` so later
     * plugins (including the DTS resolver) can load them, but they are still
     * recorded in `usedDependencies` when declared in package.json.
     * Uses the same format as rollup-plugin-dts's `resolve` option. Only
     * meaningful for DTS builds.
     */
    dtsResolve?: boolean | (string | RegExp)[];

    /**
     * Enables recommendation warnings for `@types/X` vs X dependency-placement
     * mismatches. Enabled for DTS builds.
     */
    forTypes?: boolean;

    /**
     * Suppresses the "imported but not declared in package.json" warning.
     * Enabled for DTS builds where type imports may legitimately reach
     * packages that are not runtime deps.
     */
    skipUnlistedWarnings?: boolean;
};
