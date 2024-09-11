import { cyan, gray } from "@visulima/colorize";
import type { Pail } from "@visulima/pail";
import { join, relative } from "@visulima/path";
import type { RollupCache, RollupWatcher, RollupWatcherEvent } from "rollup";
import { watch as rollupWatch } from "rollup";

import type { BuildContext } from "../types";
import enhanceRollupError from "../utils/enhance-rollup-error";
import type FileCache from "../utils/file-cache";
import { getRollupDtsOptions, getRollupOptions } from "./get-rollup-options";

const WATCH_CACHE_KEY = "rollup-watch.json";

const watchHandler = (watcher: RollupWatcher, fileCache: FileCache, cacheKey: string, mode: "bundle" | "types", logger: Pail) => {
    const prefix = "watcher:" + mode;

    watcher.on("change", (id, { event }) => {
        logger.info({
            message: `${cyan(relative(".", id))} was ${event}d`,
            prefix,
        });
    });

    watcher.on("restart", () => {
        logger.info({
            message: "Rebuilding " + mode + "...",
            prefix,
        });
    });

    watcher.on("event", async (event: RollupWatcherEvent) => {
        // eslint-disable-next-line default-case,@typescript-eslint/switch-exhaustiveness-check
        switch (event.code) {
            case "END": {
                logger.success({
                    message: "Rebuild " + mode + " finished",
                    prefix,
                });

                break;
            }
            case "BUNDLE_START": {
                logger.info({
                    message: cyan(`build started...`),
                    prefix,
                });

                break;
            }
            case "BUNDLE_END": {
                await event.result.close();

                fileCache.set(cacheKey, event.result.cache);

                logger.info({
                    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                    message: cyan(`built in ${event.duration + ""}ms.`),
                    prefix,
                });

                break;
            }
            case "ERROR": {
                enhanceRollupError(event.error);

                logger.error({
                    context: [event.error],
                    message: "Rebuild " + mode + " failed: " + event.error.message,
                    prefix,
                });

                break;
            }
            // No default
        }
    });
};

const watch = async (context: BuildContext, fileCache: FileCache): Promise<void> => {
    const rollupOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupOptions.input as any).length === 0) {
        return;
    }

    rollupOptions.cache = fileCache.get<RollupCache>(WATCH_CACHE_KEY);

    if (context.options.rollup.watch && typeof rollupOptions.watch === "object" && rollupOptions.watch.include === undefined) {
        rollupOptions.watch = {
            ...rollupOptions.watch,
            ...context.options.rollup.watch,
        };

        rollupOptions.watch.include = [join(context.options.sourceDir, "**", "*"), "package.json"];

        if (Array.isArray(context.options.rollup.watch.include)) {
            rollupOptions.watch.include = [...rollupOptions.watch.include, ...context.options.rollup.watch.include];
        } else if (context.options.rollup.watch.include) {
            rollupOptions.watch.include.push(context.options.rollup.watch.include);
        }

        rollupOptions.watch.chokidar = {
            cwd: context.options.rootDir,
            ...rollupOptions.watch.chokidar,
            ignored: [
                "**/.git/**",
                "**/node_modules/**",
                "**/test-results/**", // Playwright
                ...(rollupOptions.watch.chokidar?.ignored ?? []),
            ],
        };
    }

    const watcher = rollupWatch(rollupOptions);

    await context.hooks.callHook("rollup:watch", context, watcher);

    const inputs: string[] = [
        ...(Array.isArray(rollupOptions.input)
            ? rollupOptions.input
            : typeof rollupOptions.input === "string"
              ? [rollupOptions.input]
              : Object.keys(rollupOptions.input ?? {})),
    ];

    let infoMessage = `Starting watchers for entries:`;

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const input of inputs) {
        infoMessage += gray(`\n  └─ ${relative(process.cwd(), input)}`);
    }

    context.logger.info(infoMessage);

    watchHandler(watcher, fileCache, WATCH_CACHE_KEY, "bundle", context.logger);

    if (context.options.declaration) {
        const rollupDtsOptions = await getRollupDtsOptions(context, fileCache);

        rollupDtsOptions.cache = fileCache.get("dts-" + WATCH_CACHE_KEY);

        await context.hooks.callHook("rollup:dts:options", context, rollupDtsOptions);

        const dtsWatcher = rollupWatch(rollupDtsOptions);

        await context.hooks.callHook("rollup:watch", context, dtsWatcher);

        watchHandler(dtsWatcher, fileCache, "dts-" + WATCH_CACHE_KEY, "types", context.logger);
    }
};

export default watch;
