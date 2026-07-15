import { cachingPlugin, resolveAliases, resolveFileUrlPlugin } from "@visulima/packem-plugins";
import { externalsPlugin } from "@visulima/packem-plugins/plugin/externals";
import { fixDtsDefaultCjsExportsPlugin } from "@visulima/packem-plugins/plugin/fix-dts-default-cjs-exports";
import { licensePlugin } from "@visulima/packem-plugins/plugin/license";
import resolveImplicitExternalsPlugin from "@visulima/packem-plugins/plugin/resolve-implicit-externals";
import { removeShebangPlugin } from "@visulima/packem-plugins/plugin/shebang";
import {
    patchTypescriptTypesPlugin,
    resolveTsconfigPathsPlugin,
    resolveTsconfigRootDirectoriesPlugin,
    resolveTypescriptMjsCtsPlugin,
} from "@visulima/packem-plugins/typescript";
import type { AliasResolverObject, RollupReplaceOptions } from "@visulima/packem-rollup";
import { alias as aliasPlugin, importTrace, replace as replacePlugin } from "@visulima/packem-rollup";
import { cjsInteropPlugin } from "@visulima/packem-rollup/plugin/cjs-interop";
import type { BuildContext, FileCache } from "@visulima/packem-share";
import { sortUserPlugins } from "@visulima/packem-share/utils";
import type { OutputOptions, Plugin, RollupLog, RollupOptions } from "rollup";

import { createJsBuildOptions } from "../bundler/get-build-options";
import {
    buildInputMap,
    computeDtsResolve,
    computeDtsResolveKey,
    createNodeResolver,
    getLogger,
    getOxcTransformerConfig,
    isSuppressedBundlerLogCode,
    memoizeDtsPluginByKey,
    resolveNodeTarget,
    SCRIPT_OR_JSON_EXTENSION_REGEX,
    sharedOnWarn,
} from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";
import cloneReplaceOptions from "../utils/clone-replace-options";

// Module-scope regex constants used inside the rolldown DTS plugins. Defined
// here (not inside the plugin factories) so they are compiled once rather than
// recreated on every renderChunk/transform call.
// Matches a single rolldown region marker line (no `g`/`m` flags so it stays
// stateless for repeated `.test()` calls in the line-based filter below).
const REGION_MARKER_RE = /^\s*\/\/#(?:end)?region\b/;
const LEADING_WHITESPACE_RE = /^\s+/;
const CJS_MJS_RE = /\.[cm]js$/;

/* eslint-disable no-secrets/no-secrets -- the doc comment below references internal function names, which the entropy heuristic flags as secrets */

/**
 * Return a shallow copy of `object` without the given keys. Used to drop the
 * rollup-only option keys that rolldown 1.1.5's stricter schema rejects (see the
 * key lists in `getRolldownTransformOptions` / `getRolldownOptions`).
 */
/* eslint-enable no-secrets/no-secrets */
const omit = (object: Record<string, unknown>, keys: ReadonlyArray<string>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(object)) {
        if (!keys.includes(key)) {
            result[key] = value;
        }
    }

    return result;
};

// Rolldown 1.1.5 validates transform/output options and rejects the rollup-only keys the shared
// build config carries for rollup parity. The keys absent from rolldown's schema, by location:
//   • transform.jsx.useBuiltIns/useSpread — Babel-era knobs; rolldown's JsxOptions has neither
//   • treeshake.preset                    — rolldown has no preset knob (moduleSideEffects honoured)
//   • output.compact                      — rolldown minifies via `output.minify`
//   • output.freeze/interop/validate/importAttributesKey — not in rolldown's OutputOptions
//   • output.generatedCode.*              — rolldown's GeneratedCodeOptions only has `symbols`/`preset`
const ROLLDOWN_UNSUPPORTED_JSX_KEYS = ["useBuiltIns", "useSpread"] as const;
const ROLLDOWN_UNSUPPORTED_OUTPUT_KEYS = ["compact", "freeze", "generatedCode", "importAttributesKey", "interop", "validate"] as const;
const ROLLDOWN_GENERATED_CODE_KEYS = ["preset", "symbols"] as const;

/**
 * Rolldown 1.0 removed native CSS bundling (rolldown#4271) and rejects any module
 * whose extension defaults to `moduleTypes: "css"`. packem's `rollup-plugin-css`
 * already transforms CSS source into JS via its `transform()` hook, so treat the
 * CSS-family extensions as JS to bypass rolldown's native CSS detection and let
 * the plugin pipeline run as it does under rollup. Shared by the one-shot build
 * (bundler/build.ts) and the watch path (rollup/watch.ts).
 */
// eslint-disable-next-line import/exports-last -- consumed by the rolldown build + watch paths
export const ROLLDOWN_CSS_MODULE_TYPES = {
    ".css": "js",
    ".less": "js",
    ".pcss": "js",
    ".sass": "js",
    ".scss": "js",
    ".styl": "js",
    ".stylus": "js",
} as const;

/**
 * Rolldown bundles an oxc-based transform natively, so the rolldown builder
 * does NOT run packem's transformer adapter plugin (the esbuild/swc/sucrase/
 * oxc rollup plugin). Instead it feeds rolldown's `transform` input option the
 * same oxc-shaped config the oxc adapter would have produced: TS/JSX still get
 * compiled, but by rolldown's built-in pipeline rather than an extra plugin
 * pass over every module.
 *
 * `define` is intentionally not carried here: packem's shared `replace` plugin
 * already runs under rolldown and owns global replacement, so emitting it again
 * via `transform.define` would double-apply.
 *
 * When oxc options are disabled (`rollup.oxc: false`) there is nothing to
 * forward — rolldown falls back to its own tsconfig-driven transform defaults.
 */
const getRolldownTransformOptions = (context: BuildContext<InternalBuildOptions>): Record<string, unknown> => {
    if (!context.options.rollup.oxc) {
        return {};
    }

    const oxc = getOxcTransformerConfig(context, resolveNodeTarget(context));

    // `oxc.jsx` carries the Babel-era `useBuiltIns`/`useSpread` knobs the oxc *plugin* accepts;
    // rolldown's native `transform.jsx` schema (JsxOptions) has neither, so drop them before
    // forwarding. The keys rolldown does accept (runtime, development, pragma, pragmaFrag, pure,
    // importSource) pass through untouched.
    const jsx = oxc.jsx && typeof oxc.jsx === "object" ? omit(oxc.jsx as Record<string, unknown>, ROLLDOWN_UNSUPPORTED_JSX_KEYS) : oxc.jsx;

    return {
        jsx,
        target: oxc.target,
        typescript: oxc.typescript,
    };
};

/**
 * Build the rolldown variant of the JS-build options. Starts from the shared
 * base (`createJsBuildOptions(..., "rolldown")`) — which already skips the
 * rollup-only ecosystem plugins and the transformer adapter — and layers
 * rolldown's native `transform` input option on top.
 *
 * The cast is intentional: `transform` is not part of rollup's `RollupOptions`,
 * and `bundler/build.ts` already treats rolldown options as an open record.
 */
export const getRolldownOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const options = await createJsBuildOptions(context, fileCache, "rolldown");

    (options as Record<string, unknown>).transform = getRolldownTransformOptions(context);

    // Bypass rolldown's native CSS detection (see ROLLDOWN_CSS_MODULE_TYPES). User
    // overrides win, so spread any existing `moduleTypes` last.
    (options as Record<string, unknown>).moduleTypes = {
        ...ROLLDOWN_CSS_MODULE_TYPES,
        ...(options as { moduleTypes?: Record<string, string> }).moduleTypes,
    };

    // Strip the rollup-only keys rolldown 1.1.5 rejects (see ROLLDOWN_UNSUPPORTED_* above) so the
    // rolldown backend builds without "Invalid options" warnings.
    if (options.treeshake && typeof options.treeshake === "object") {
        options.treeshake = omit(options.treeshake as Record<string, unknown>, ["preset"]);
    }

    if (Array.isArray(options.output)) {
        options.output = options.output.map((output: OutputOptions) => {
            const original = output as Record<string, unknown>;
            const sanitized = omit(original, ROLLDOWN_UNSUPPORTED_OUTPUT_KEYS);

            const { generatedCode } = original;

            if (generatedCode && typeof generatedCode === "object") {
                // generatedCode was stripped above; re-add it keeping only the sub-keys
                // rolldown's GeneratedCodeOptions defines.
                const source = generatedCode as Record<string, unknown>;

                sanitized.generatedCode = Object.fromEntries(ROLLDOWN_GENERATED_CODE_KEYS.map((key) => [key, source[key]]));
            }

            // Rolldown's `output.minify` defaults to 'dce-only' (no identifier/whitespace
            // compression); the rollup backend gets real minification through the esbuild/swc
            // transformer adapter's renderChunk hook. Forward the intent so a rolldown build with
            // `minify: true` does not emit 2x-larger code than the equivalent rollup build.
            if (context.options.minify) {
                sanitized.minify = true;
            }

            return sanitized;
        });
    }

    return options;
};

/**
 * Strip `//#region …` and `//#endregion` comments that rolldown injects into
 * emitted chunks (including `.d.ts` chunks). These comments carry
 * worktree-sensitive absolute paths — omitting them keeps emitted declarations
 * machine-independent and snapshot-stable.
 *
 * After removing the region markers, normalize whitespace to match rollup's DTS
 * output format:
 *
 * - Drop region marker lines and only the blank lines they leave behind (the markers carry path-sensitive content; their removal otherwise leaves stray blanks). Intentional blank-line structure elsewhere in the declarations is preserved.
 * - Remove leading blank lines (rolldown wraps the whole chunk in a region block that leaves a leading blank line after stripping).
 * - Ensure a single trailing newline.
 *
 * The strip runs as a `renderChunk` output-stage plugin so it applies to every
 * `write()` call individually, matching the per-extension write loop in
 * `build-types.ts`.
 */

export const stripRolldownRegionCommentsPlugin = (): Plugin => {
    return {
        name: "packem:strip-rolldown-region-comments",
        renderChunk(code) {
            // 1. Drop region marker lines plus only the blank lines they introduce.
            //    A blank line is removed when it sits directly next to a marker (the
            //    artifact rolldown leaves around its `//#region`/`//#endregion`
            //    wrappers); blank lines elsewhere are left untouched so we don't
            //    rewrite intentional declaration structure.
            const lines = code.split("\n");
            const kept: string[] = [];

            for (let index = 0; index < lines.length; index += 1) {
                const line = lines[index];

                if (REGION_MARKER_RE.test(line)) {
                    continue;
                }

                if (line.trim() === "") {
                    const previousIsMarker = index > 0 && REGION_MARKER_RE.test(lines[index - 1]);
                    const nextIsMarker = index < lines.length - 1 && REGION_MARKER_RE.test(lines[index + 1]);

                    if (previousIsMarker || nextIsMarker) {
                        continue;
                    }
                }

                kept.push(line);
            }

            let stripped = kept.join("\n");

            // 2. Remove any remaining leading whitespace/blank lines.
            stripped = stripped.replace(LEADING_WHITESPACE_RE, "");

            // 3. Ensure a single trailing newline.
            stripped = `${stripped.trimEnd()}\n`;

            if (stripped === code) {
                return undefined;
            }

            // map: undefined — DTS chunks carry no sourcemap, matching the repo's
            // other declaration transforms (fix-dts-default-cjs-exports, shebang).
            return { code: stripped, map: undefined };
        },
    };
};

/**
 * Build the rolldown variant of the DTS options. Mirrors `getRollupDtsOptions`
 * from `get-rollup-options.ts` but adapts for rolldown:
 *
 * - Drops `treeshake.preset` (rolldown emits a warning for it; `moduleSideEffects` is preserved).
 * - Omits the `output` array (the per-extension write loop in `build-types.ts` drives output directly).
 * - Has no serializable cache (rolldown manages its own incremental state).
 * - Appends `stripRolldownRegionCommentsPlugin()` to remove worktree-path region comments injected by rolldown.
 *
 * Hook names (`rollup:dts:options`, `rollup:dts:build`, `rollup:dts:done`) are
 * kept identical so user hooks fire for both backends without duplication.
 */

export const getRolldownDtsOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const resolvedAliases = resolveAliases(context.pkg, context.options);
    const dtsResolve = computeDtsResolve(context);
    const nodeResolver = createNodeResolver(context);

    // Mirror the memoization key from getRollupDtsOptions — same cache-busting
    // rationale (parallel sibling builds must not share one plugin instance).
    const resolveKey = computeDtsResolveKey(dtsResolve);
    const entriesKey = context.options.entries
        .map((entry) => entry.name ?? "")
        .filter((name) => name !== "")
        .toSorted((a, b) => a.localeCompare(b))
        .join(",");
    const uniqueProcessId = `dts-plugin:rolldown:${String(process.pid)}${context.tsconfig?.path ?? ""}:${resolveKey}:${entriesKey}`;

    const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(context.options.rollup.plugins, "dts");

    const options: RollupOptions = {
        input: buildInputMap(context),

        logLevel: context.options.debug ? "debug" : "info",

        onLog: (level: "debug" | "info" | "warn", log: RollupLog) => {
            // Suppress the same advisory codes (EMPTY_BUNDLE, MIXED_EXPORTS) the rollup path drops,
            // via the shared predicate so the two lanes cannot drift.
            if (isSuppressedBundlerLogCode(log.code)) {
                return;
            }

            const format = log.stack ? `${log.message}\n${log.stack}` : log.message;
            const prefix = `dts${log.plugin ? `:plugin:${log.plugin}` : ""}`;
            const logger = getLogger(context);

            if (level === "info") {
                logger.info({ message: format, prefix });
            } else if (level === "warn") {
                logger.warn({ message: format, prefix });
            } else {
                logger.debug({ message: format, prefix });
            }
        },

        onwarn(warning: RollupLog, rollupWarn: (warning: RollupLog) => void) {
            if (sharedOnWarn(warning, context)) {
                return;
            }

            if (isSuppressedBundlerLogCode(warning.code)) {
                return;
            }

            if (warning.code === "CIRCULAR_DEPENDENCY") {
                return;
            }

            rollupWarn(warning);
        },

        plugins: [
            importTrace(),

            cachingPlugin(resolveFileUrlPlugin(), fileCache),
            cachingPlugin(resolveTypescriptMjsCtsPlugin(), fileCache),

            externalsPlugin(context, {
                dtsResolve,
                forTypes: true,
                skipUnlistedWarnings: true,
            }),

            // Prevent rolldown from loading non-source files (e.g. raw data, images, styles)
            // imported from TS during the DTS build — the DTS plugin short-circuits everything
            // through its transform hook, but load runs first and needs a stub for other ids.
            <Plugin>{
                load(id: string) {
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
            && replacePlugin(cloneReplaceOptions(context.options.rollup.replace, { sourcemap: context.options.sourcemap }) as RollupReplaceOptions),

            context.options.rollup.alias
            && aliasPlugin({
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

            // Rolldown-CJS-compat: rolldown infers `.cjs`/`.mjs` module types by extension
            // and fails with PARSE_ERROR when the DTS plugin's transform emits `export {}`
            // for these files (rolldown treats `.cjs` as CommonJS and rejects ESM syntax).
            // Re-stubbing the transform output as empty after the DTS plugin runs lets
            // rolldown parse the file as CJS without error (empty module → no exports).
            // rollup doesn't have this issue because it is extension-agnostic when parsing
            // transform hook results.
            <Plugin>{
                name: "packem:rolldown-cjs-mjs-dts-compat",
                transform(_code: string, id: string) {
                    // Only intercept the extension types rolldown can't parse as ESM.
                    if (CJS_MJS_RE.test(id)) {
                        return { code: "" };
                    }

                    return undefined;
                },
            },

            // Strip rolldown's worktree-path region comments from declaration chunks.
            // This MUST be last so it sees the fully-rendered output of every other plugin.
            stripRolldownRegionCommentsPlugin(),
        ].filter(Boolean),

        preserveEntrySignatures: "strict",

        // No `output` array: the per-extension write loop in build-types.ts
        // drives each write() call directly. The rollup path also leaves `output`
        // unused during one-shot builds (it is only consumed by the watch path).

        // No `cache`: rolldown has no serializable cache.

        // Rolldown warns on `treeshake.preset` (Step 0 probe) but we keep the
        // side-effects flag which is the semantically important setting for DTS.
        treeshake: {
            moduleSideEffects: true,
        },
    };

    // Rolldown infers module types from file extensions: `.cjs` → CJS, `.mts` → ESM.
    // For DTS builds, `.cts` and `.mts` are TypeScript source files that the DTS
    // plugin transforms. Rolldown must treat their transform output as TypeScript
    // (which the DTS plugin handles) rather than as CJS (which would reject `export`).
    // Override `.cts` and `.mts` to `"ts"` so rolldown routes them through the
    // TypeScript transform pipeline; `.cjs`/`.mjs` stubs are handled by the
    // packem:rolldown-cjs-mjs-dts-compat plugin above.
    // Cast: `moduleTypes` is rolldown-specific; not in rollup's RollupOptions.
    (options as Record<string, unknown>).moduleTypes = {
        ".cts": "ts",
        ".mts": "ts",
    };

    return options;
};
