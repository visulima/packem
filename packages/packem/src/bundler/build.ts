import type { FileCache } from "@visulima/packem-share";
import type { BuildContext, BuildContextBuildAssetAndChunk, BuildContextBuildEntry } from "@visulima/packem-share/types";
import type { OutputOptions, RollupBuild, RollupCache, RollupOptions } from "rollup";

import { getRolldownBuild } from "../rolldown/get-rolldown";
import { getRolldownOptions } from "../rolldown/get-rolldown-options";
import type { InternalBuildOptions } from "../types";
import { collectBuildEntries } from "../utils/collect-build-entries";
import { getRollupOptions } from "./get-build-options";
import { getRollupBuild } from "./get-rollup";

const BUNDLE_CACHE_KEY = "rollup-build.json";
const DEPENDENCIES_CACHE_KEY = "dependencies-cache.json";

type BundlerName = "rolldown" | "rollup";

const resolveBundlerName = (bundler: BundlerName | undefined): BundlerName => bundler ?? "rollup";

const dependencyValidationEnabled = (context: BuildContext<InternalBuildOptions>): boolean =>
    Boolean(context.options.validation && context.options.validation.dependencies !== false);

// Replay the persisted dependencies cache into the build context. The cache is
// populated by our own plugins and feeds dependency validation, so both the
// rollup and rolldown paths must load it identically.
const loadDependenciesCache = (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string): void => {
    const cachedDeps = fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory);

    if (cachedDeps) {
        // The deserialized cache payload can be partial despite the typed
        // shape, so the runtime guards are intentional.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cache JSON read from disk may omit fields
        cachedDeps.used?.forEach((dep) => context.usedDependencies.add(dep));
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cache JSON read from disk may omit fields
        cachedDeps.hoisted?.forEach((dep) => context.hoistedDependencies.add(dep));
    }
};

// Persist the context's resolved dependencies, but only when dependency
// validation is enabled (both backends gate the write the same way).
const persistDependenciesCache = (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string): void => {
    if (dependencyValidationEnabled(context)) {
        fileCache.set(
            DEPENDENCIES_CACHE_KEY,
            {
                hoisted: [...context.hoistedDependencies],
                used: [...context.usedDependencies],
            },
            subDirectory,
        );
    }
};

const buildWithRollup = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    subDirectory: string,
    rollupOptions: RollupOptions,
): Promise<void> => {
    const hasCachedDependencies =
        dependencyValidationEnabled(context) && Boolean(fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory));

    const loadCache = !dependencyValidationEnabled(context) || hasCachedDependencies;

    // Build the effective options without mutating the caller's object: only
    // inject the persisted rollup cache when cache loading is enabled.
    let effectiveOptions: RollupOptions = rollupOptions;

    if (loadCache) {
        effectiveOptions = {
            ...rollupOptions,
            cache: fileCache.get<RollupCache>(BUNDLE_CACHE_KEY, subDirectory),
        };

        if (hasCachedDependencies) {
            loadDependenciesCache(context, fileCache, subDirectory);
        }
    }

    const rollup = await getRollupBuild();
    const buildResult = await rollup(effectiveOptions);

    try {
        if (loadCache) {
            fileCache.set(BUNDLE_CACHE_KEY, buildResult.cache, subDirectory);
        }

        persistDependenciesCache(context, fileCache, subDirectory);

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
    rollupOptions: RollupOptions,
): Promise<void> => {
    // Rolldown owns its own incremental cache, so we don't shadow it with
    // BUNDLE_CACHE_KEY the way the rollup path does. The dependencies cache,
    // however, is populated by our own plugins and feeds dependency
    // validation — so it must stay in sync regardless of bundler.
    const hasCachedDependencies =
        dependencyValidationEnabled(context) && Boolean(fileCache.get<{ hoisted: string[]; used: string[] }>(DEPENDENCIES_CACHE_KEY, subDirectory));

    if (hasCachedDependencies) {
        loadDependenciesCache(context, fileCache, subDirectory);
    }

    const rolldown = await getRolldownBuild();

    // `rollupOptions` here is produced by getRolldownOptions, which already applies
    // the rolldown `moduleTypes` CSS override (see ROLLDOWN_CSS_MODULE_TYPES), so it
    // can be passed straight through.
    const bundle = await rolldown(rollupOptions);

    try {
        persistDependenciesCache(context, fileCache, subDirectory);

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

const build = async (context: BuildContext<InternalBuildOptions>, fileCache: FileCache, subDirectory: string, bundler: BundlerName): Promise<void> => {
    const isRolldown = bundler === "rolldown";

    // Pick the backend-specialised builder so the rolldown path never even
    // constructs the rollup-only ecosystem plugins / transformer adapter.
    const rollupOptions = isRolldown ? await getRolldownOptions(context, fileCache) : await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupOptions);

    if (Object.keys(rollupOptions.input ?? {}).length === 0) {
        return;
    }

    await (isRolldown ? buildWithRolldown(context, fileCache, subDirectory, rollupOptions) : buildWithRollup(context, fileCache, subDirectory, rollupOptions));

    // Cache writes are fire-and-forget (FileCache.set queues an async write and
    // serves same-process reads from memory), so flush the queue here — once the
    // build has finished issuing writes — to guarantee the cache is fully on disk
    // before the process can exit and is available to the next (warm) build.
    await fileCache.flush();
};

export type { BundlerName };
export { resolveBundlerName };
export default build;
