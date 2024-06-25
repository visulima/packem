import { cyan, gray } from "@visulima/colorize";
import type { Pail } from "@visulima/pail";
import { join, relative } from "@visulima/path";
import type { RollupWatcher, RollupWatcherEvent } from "rollup";
import { watch as rollupWatch } from "rollup";

import type { BuildContext } from "../types";
import enhanceRollupError from "../utils/enhance-rollup-error";
import type FileCache from "../utils/file-cache";
import { getRollupDtsOptions, getRollupOptions } from "./get-rollup-options";

const watchHandler = (watcher: RollupWatcher, mode: "bundle" | "types", logger: Pail) => {
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

    rollupOptions.cache = fileCache.get("rollup-watch");

    if (typeof rollupOptions.watch === "object" && rollupOptions.watch.include === undefined) {
        rollupOptions.watch.include = [join(context.options.sourceDir, "**")];

        rollupOptions.watch.chokidar = {
            cwd: context.options.rootDir,
            ...rollupOptions.watch.chokidar,
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

    watchHandler(watcher, "bundle", context.logger);

    if (context.options.declaration) {
        const rollupDtsOptions = await getRollupDtsOptions(context, fileCache);

        await context.hooks.callHook("rollup:dts:options", context, rollupDtsOptions);

        const dtsWatcher = rollupWatch(rollupDtsOptions);

        await context.hooks.callHook("rollup:watch", context, dtsWatcher);

        watchHandler(dtsWatcher, "types", context.logger);
    }
};

export default watch;
