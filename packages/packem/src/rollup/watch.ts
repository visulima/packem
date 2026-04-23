import { watch as fsWatch } from "node:fs";

import { cyan, gray } from "@visulima/colorize";
import type { FileCache } from "@visulima/packem-share";
import { enhanceRollupError } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import { join, relative } from "@visulima/path";
import type { RollupCache, RollupWatcher, RollupWatcherEvent } from "rollup";
import { watch as rollupWatch } from "rollup";

import loadPackageJson from "../config/utils/load-package-json";
import prepareEntries from "../config/utils/prepare-entries";
import type { InternalBuildOptions } from "../types";
import { getRollupDtsOptions, getRollupOptions } from "./get-rollup-options";

const WATCH_CACHE_KEY = "rollup-watch.json";

const watchHandler = ({
    context,
    doOnSuccessCleanup,
    fileCache,
    mode,
    runBuilder,
    runOnsuccess,
    useCache,
    watcher,
}: {
    context: BuildContext<InternalBuildOptions>;
    doOnSuccessCleanup?: () => Promise<void>;
    fileCache: FileCache;
    mode: "bundle" | "types";
    runBuilder?: (watchMode?: true) => Promise<void>;
    runOnsuccess?: () => Promise<void>;
    useCache: boolean;
    watcher: RollupWatcher;
}): void => {
    const prefix = `watcher:${mode}`;

    watcher.on("change", async (id, { event }) => {
        await doOnSuccessCleanup?.();

        context.logger.info({
            message: `${cyan(relative(".", id))} was ${event}d`,
            prefix,
        });
    });

    watcher.on("restart", () => {
        context.logger.info({
            message: "Rebuilding ...",
            prefix,
        });
    });

    watcher.on("event", async (event: RollupWatcherEvent) => {
        // eslint-disable-next-line default-case
        switch (event.code) {
            case "BUNDLE_END": {
                await event.result.close();

                if (useCache) {
                    fileCache.set(mode === "bundle" ? WATCH_CACHE_KEY : `dts-${WATCH_CACHE_KEY}`, event.result.cache);
                }

                context.logger.raw(`\n⚡️ Build run in ${event.duration}ms\n\n`);

                await runBuilder?.(true);

                break;
            }
            case "BUNDLE_START": {
                context.logger.info({
                    message: cyan(`build started...`),
                    prefix,
                });

                break;
            }
            case "END": {
                context.logger.success({
                    message: "Rebuild finished",
                    prefix,
                });

                await runOnsuccess?.();

                break;
            }
            case "ERROR": {
                enhanceRollupError(event.error);

                context.logger.error({
                    context: [event.error],
                    message: `Rebuild failed: ${event.error.message}`,
                    prefix,
                });

                break;
            }
            // No default
        }
    });
};

const logInputs = (context: BuildContext<InternalBuildOptions>, rollupOptions: { input?: Record<string, string> | string | string[] }): void => {
    const inputs: string[] = [];

    if (Array.isArray(rollupOptions.input)) {
        inputs.push(...rollupOptions.input);
    } else if (typeof rollupOptions.input === "string") {
        inputs.push(rollupOptions.input);
    } else {
        inputs.push(...Object.keys(rollupOptions.input ?? {}));
    }

    let infoMessage = `Starting watcher for entries:`;

    for (const input of inputs) {
        infoMessage += gray(`\n  └─ ${relative(process.cwd(), input)}`);
    }

    context.logger.info(infoMessage);
};

const configureWatchOptions = (
    context: BuildContext<InternalBuildOptions>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rollupOptions: { watch?: any },
): void => {
    if (context.options.rollup.watch && typeof rollupOptions.watch === "object" && (rollupOptions.watch as Record<string, unknown>).include === undefined) {
        rollupOptions.watch = {
            ...rollupOptions.watch,
            ...context.options.rollup.watch,
        };

        (rollupOptions.watch as Record<string, unknown>).include = [
            join(context.options.sourceDir, "**", "*"),
            "package.json",
            "packem.config.*",
            "tsconfig.json",
            "tsconfig.*.json",
        ];

        if (Array.isArray(context.options.rollup.watch.include)) {
            ((rollupOptions.watch as Record<string, unknown>).include as (string | RegExp)[]) = [
                ...((rollupOptions.watch as Record<string, unknown>).include as (string | RegExp)[]),
                ...context.options.rollup.watch.include,
            ];
        } else if (context.options.rollup.watch.include) {
            ((rollupOptions.watch as Record<string, unknown>).include as string[]).push(context.options.rollup.watch.include as string);
        }

        (rollupOptions.watch as Record<string, unknown>).chokidar = {
            cwd: context.options.rootDir,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(rollupOptions.watch as any).chokidar,
            ignored: [
                "**/.git/**",
                "**/node_modules/**",
                "**/test-results/**", // Playwright
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...((rollupOptions.watch as any).chokidar?.ignored ?? []),
            ],
        };
    }
};

// eslint-disable-next-line sonarjs/cognitive-complexity
const watch = async (
    context: BuildContext<InternalBuildOptions>,
    fileCache: FileCache,
    runBuilder: () => Promise<void>,
    runOnsuccess: () => Promise<void>,
    doOnSuccessCleanup: () => Promise<void>,
): Promise<void> => {
    let useCache = true;

    // TODO: find a way to remove this hack
    // This is a hack to prevent caching when using css loaders
    if (context.options.rollup.css) {
        useCache = false;
    }

    let watchers: RollupWatcher[] = [];

    const closeWatchers = async (): Promise<void> => {
        await Promise.all(watchers.map((w) => w.close()));
        watchers = [];
    };

    const startWatchers = async (): Promise<void> => {
        const rollupOptions = await getRollupOptions(context, fileCache);

        await context.hooks.callHook("rollup:options", context, rollupOptions);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (Object.keys(rollupOptions.input as any).length === 0) {
            return;
        }

        if (useCache) {
            rollupOptions.cache = fileCache.get<RollupCache>(WATCH_CACHE_KEY);
        }

        configureWatchOptions(context, rollupOptions);

        const bundleWatcher = rollupWatch(rollupOptions);

        await context.hooks.callHook("rollup:watch", context, bundleWatcher);

        logInputs(context, rollupOptions);

        watchHandler({
            context,
            doOnSuccessCleanup,
            fileCache,
            mode: "bundle",
            runBuilder,
            runOnsuccess,
            useCache,
            watcher: bundleWatcher,
        });

        watchers.push(bundleWatcher);

        if (context.options.declaration) {
            const rollupDtsOptions = await getRollupDtsOptions(context, fileCache);

            if (useCache) {
                rollupDtsOptions.cache = fileCache.get(`dts-${WATCH_CACHE_KEY}`);
            }

            await context.hooks.callHook("rollup:dts:options", context, rollupDtsOptions);

            const dtsWatcher = rollupWatch(rollupDtsOptions);

            await context.hooks.callHook("rollup:watch", context, dtsWatcher);

            watchHandler({
                context,
                fileCache,
                mode: "types",
                useCache,
                watcher: dtsWatcher,
            });

            watchers.push(dtsWatcher);
        }
    };

    await startWatchers();

    // Watch package.json for entry point changes.
    // Rollup's watcher only rebuilds with the same config — it can't pick up
    // new entry points. We use fs.watch to close and restart watchers when
    // package.json changes, re-inferring entries from the updated exports.
    const packageJsonPath = join(context.options.rootDir, "package.json");
    let debounceTimer: ReturnType<typeof setTimeout>;

    fsWatch(packageJsonPath, () => {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
            context.logger.info("package.json changed, restarting watchers...");

            try {
                await closeWatchers();

                // Re-read package.json and re-infer entries
                const { packageJson } = loadPackageJson(context.options.rootDir);

                context.pkg = packageJson;
                context.options.entries.length = 0;
                context.buildEntries.length = 0;
                await context.hooks.callHook("build:prepare", context);
                await prepareEntries(context);

                await startWatchers();
            } catch (error) {
                context.logger.error({
                    message: `Failed to restart watchers: ${(error as Error).message}`,
                    prefix: "watcher",
                });
            }
        }, 100);
    });
};

export default watch;
