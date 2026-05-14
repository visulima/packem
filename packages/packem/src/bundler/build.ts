import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import type { OutputOptions, RollupBuild, RollupCache } from "rollup";

import { getRolldownBuild } from "../rolldown/get-rolldown";
import { getRollupOptions } from "../rollup/get-rollup-options";
import type { InternalBuildOptions } from "../types";
import { collectBuildEntries } from "../utils/collect-build-entries";
import { getRollupBuild } from "./get-rollup";

const BUNDLE_CACHE_KEY = "rollup-build.json";
const DEPENDENCIES_CACHE_KEY = "dependencies-cache.json";

export type BundlerName = "rolldown" | "rollup";

export const resolveBundlerName = (bundler: BundlerName | undefined): BundlerName => bundler ?? "rollup";

const ROLLDOWN_CSS_MODULE_TYPES = {
    ".css": "js",
    ".less": "js",
    ".pcss": "js",
    ".sass": "js",
    ".scss": "js",
    ".styl": "js",
    ".stylus": "js",
} as const;

const buildWithRollup = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rollupOptions: any,
): Promise<void> => {
    const hasCachedDependencies
        = context.options.validation
            && context.options.validation.dependencies !== false
            && !!fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

    const loadCache = !context.options.validation || context.options.validation.dependencies === false || hasCachedDependencies;

    if (loadCache) {
        rollupOptions.cache = fileCache.get<RollupCache>(BUNDLE_CACHE_KEY, subDirectory);

        if (hasCachedDependencies) {
            const cachedDeps = fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

            if (cachedDeps) {
                cachedDeps.used?.forEach((dep) => context.usedDependencies.add(dep));
                cachedDeps.hoisted?.forEach((dep) => context.hoistedDependencies.add(dep));
            }
        }
    }

    const rollup = await getRollupBuild();
    const buildResult = await rollup(rollupOptions);

    try {
        if (loadCache) {
            fileCache.set(BUNDLE_CACHE_KEY, buildResult.cache, subDirectory);
        }

        if (context.options.validation && context.options.validation.dependencies !== false) {
            fileCache.set(
                DEPENDENCIES_CACHE_KEY,
                {
                    hoisted: [...context.hoistedDependencies],
                    used: [...context.usedDependencies],
                },
                subDirectory,
            );
        }

        await context.hooks.callHook("rollup:build", context, buildResult);

        const assets = new Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>();

        for (const outputOptions of rollupOptions.output as OutputOptions[]) {
            // eslint-disable-next-line no-await-in-loop
            const { output } = await buildResult.write(outputOptions);
            collectBuildEntries(output, context, assets);
        }

        context.buildEntries.push(...assets.values());
    } finally {
        await buildResult.close();
    }
};

const buildWithRolldown = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rollupOptions: any,
): Promise<void> => {
    // Rolldown owns its own incremental cache, so we don't shadow it with
    // BUNDLE_CACHE_KEY the way the rollup path does. The dependencies cache,
    // however, is populated by our own plugins and feeds dependency
    // validation — so it must stay in sync regardless of bundler.
    const hasCachedDependencies
        = context.options.validation
            && context.options.validation.dependencies !== false
            && !!fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

    if (hasCachedDependencies) {
        const cachedDeps = fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

        if (cachedDeps) {
            cachedDeps.used?.forEach((dep) => context.usedDependencies.add(dep));
            cachedDeps.hoisted?.forEach((dep) => context.hoistedDependencies.add(dep));
        }
    }

    const rolldown = await getRolldownBuild();

    // Rolldown 1.0 removed native CSS bundling (rolldown#4271) and rejects any
    // module whose extension defaults to `moduleTypes: "css"`. Our `rollup-plugin-css`
    // already transforms CSS source into JS via the `transform()` hook, so override
    // the defaults to treat CSS-family extensions as JS — rolldown's CSS detection
    // gets bypassed and the plugin pipeline runs as it does under rollup.
    const rolldownOptions = {
        ...rollupOptions,
        moduleTypes: {
            ...ROLLDOWN_CSS_MODULE_TYPES,
            ...((rollupOptions as { moduleTypes?: Record<string, string> }).moduleTypes ?? {}),
        },
    } as unknown as Record<string, unknown>;

    const bundle = await rolldown(rolldownOptions);

    try {
        if (context.options.validation && context.options.validation.dependencies !== false) {
            fileCache.set(
                DEPENDENCIES_CACHE_KEY,
                {
                    hoisted: [...context.hoistedDependencies],
                    used: [...context.usedDependencies],
                },
                subDirectory,
            );
        }

        await context.hooks.callHook("rollup:build", context, bundle as unknown as RollupBuild);

        const assets = new Map<string, BuildContextBuildAssetAndChunk | BuildContextBuildEntry>();

        for (const outputOptions of rollupOptions.output as unknown as Record<string, unknown>[]) {
            // eslint-disable-next-line no-await-in-loop
            const { output } = await bundle.write(outputOptions);
            collectBuildEntries(output, context, assets);
        }

        context.buildEntries.push(...assets.values());
    } finally {
        await bundle.close?.();
    }
};

const build = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
    bundler: BundlerName,
): Promise<void> => {
    const rollupOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupOptions.input as any).length === 0) {
        return;
    }

    if (bundler === "rolldown") {
        await buildWithRolldown(context, fileCache, subDirectory, rollupOptions);

        return;
    }

    await buildWithRollup(context, fileCache, subDirectory, rollupOptions);
};

export default build;
