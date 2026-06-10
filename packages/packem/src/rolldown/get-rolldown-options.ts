import type { FileCache } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import type { OutputOptions, RollupOptions } from "rollup";

import { createJsBuildOptions } from "../bundler/get-build-options";
import { getOxcTransformerConfig, resolveNodeTarget } from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";

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

    return {
        jsx: oxc.jsx,
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
// eslint-disable-next-line import/prefer-default-export -- paired with src/rollup/get-rollup-options.ts which exports as named; keep both APIs symmetric
export const getRolldownOptions = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache): Promise<RollupOptions> => {
    const options = await createJsBuildOptions(context, fileCache, "rolldown");

    (options as Record<string, unknown>).transform = getRolldownTransformOptions(context);

    // Bypass rolldown's native CSS detection (see ROLLDOWN_CSS_MODULE_TYPES). User
    // overrides win, so spread any existing `moduleTypes` last.
    (options as Record<string, unknown>).moduleTypes = {
        ...ROLLDOWN_CSS_MODULE_TYPES,
        ...((options as { moduleTypes?: Record<string, string> }).moduleTypes ?? {}),
    };

    // Rolldown's `output.minify` defaults to `'dce-only'` (no identifier/whitespace
    // compression), while the rollup backend gets real minification through the
    // esbuild/swc transformer adapter's renderChunk hook. Without this forward,
    // a rolldown build with `minify: true` would emit 2x-larger code than the
    // equivalent rollup build. The shared output array carries `compact:
    // context.options.minify` for rollup parity; rolldown ignores `compact` and
    // wants `minify` instead.
    if (context.options.minify && Array.isArray(options.output)) {
        options.output = options.output.map((output: OutputOptions) => {
            return {
                ...output,
                minify: true,
            };
        });
    }

    return options;
};
