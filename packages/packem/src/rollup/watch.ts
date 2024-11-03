import { cyan, gray } from "@visulima/colorize";
import { join, relative } from "@visulima/path";
import type { RollupCache, RollupWatcher, RollupWatcherEvent } from "rollup";
import { watch as rollupWatch } from "rollup";

import type { BuildContext } from "../types";
import enhanceRollupError from "../utils/enhance-rollup-error";
import type FileCache from "../utils/file-cache";
import { getRollupDtsOptions, getRollupOptions } from "./get-rollup-options";

const WATCH_CACHE_KEY = "rollup-watch.json";

const watchHandler = ({
    context,
    doOnSuccessCleanup,
    fileCache,
    mode,
    runBuilder,
    runOnsuccess,
    watcher,
}: {
    context: BuildContext;
    doOnSuccessCleanup?: () => Promise<void>;
    fileCache: FileCache;
    mode: "bundle" | "types";
    runBuilder?: (watchMode?: true) => Promise<void>;
    runOnsuccess?: () => Promise<void>;
    watcher: RollupWatcher;
}): void => {
    const prefix = "watcher:" + mode;

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
        // eslint-disable-next-line default-case,@typescript-eslint/switch-exhaustiveness-check
        switch (event.code) {
            case "END": {
                context.logger.success({
                    message: "Rebuild finished",
                    prefix,
                });

                await runOnsuccess?.();

                break;
            }
            case "BUNDLE_START": {
                context.logger.info({
                    message: cyan(`build started...`),
                    prefix,
                });

                break;
            }
            case "BUNDLE_END": {
                await event.result.close();

                fileCache.set(mode === "bundle" ? WATCH_CACHE_KEY : "dts-" + WATCH_CACHE_KEY, event.result.cache);

                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                context.logger.raw("\n⚡️ Build run in " + event.duration + "ms\n\n");

                await runBuilder?.(true);

                break;
            }
            case "ERROR": {
                enhanceRollupError(event.error);

                context.logger.error({
                    context: [event.error],
                    message: "Rebuild failed: " + event.error.message,
                    prefix,
                });

                break;
            }
            // No default
        }
    });
};

const watch = async (
    context: BuildContext,
    fileCache: FileCache,
    runBuilder: () => Promise<void>,
    runOnsuccess: () => Promise<void>,
    doOnSuccessCleanup: () => Promise<void>,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<void> => {
    const rollupOptions = await getRollupOptions(context, fileCache);

    await context.hooks.callHook("rollup:options", context, rollupOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Object.keys(rollupOptions.input as any).length === 0) {
        return;
    }

    if (!context.options.rollup.isolatedDeclarations || !context.options.isolatedDeclarationTransformer) {
        rollupOptions.cache = fileCache.get<RollupCache>(WATCH_CACHE_KEY);
    }

    if (context.options.rollup.watch && typeof rollupOptions.watch === "object" && rollupOptions.watch.include === undefined) {
        rollupOptions.watch = {
            ...rollupOptions.watch,
            ...context.options.rollup.watch,
        };

        rollupOptions.watch.include = [join(context.options.sourceDir, "**", "*"), "package.json", "packem.config.*"];

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

    let infoMessage = `Starting watcher for entries:`;

    for (const input of inputs) {
        infoMessage += gray(`\n  └─ ${relative(process.cwd(), input)}`);
    }

    context.logger.info(infoMessage);

    watchHandler({
        context,
        doOnSuccessCleanup,
        fileCache,
        mode: "bundle",
        runBuilder,
        runOnsuccess,
        watcher,
    });

    if (context.options.declaration && context.options.rollup.isolatedDeclarations && context.options.isolatedDeclarationTransformer) {
        context.logger.info({
            message: "Using isolated declaration transformer to generate declaration files...",
            prefix: "dts",
        });
    } else if (context.options.declaration) {
        const rollupDtsOptions = await getRollupDtsOptions(context, fileCache);

        rollupDtsOptions.cache = fileCache.get("dts-" + WATCH_CACHE_KEY);

        await context.hooks.callHook("rollup:dts:options", context, rollupDtsOptions);

        const dtsWatcher = rollupWatch(rollupDtsOptions);

        await context.hooks.callHook("rollup:watch", context, dtsWatcher);

        watchHandler({
            context,
            fileCache,
            mode: "types",
            watcher: dtsWatcher,
        });
    }
};

export default watch;
