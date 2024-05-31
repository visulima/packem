import { cyan, gray } from "@visulima/colorize";
import type { Pail } from "@visulima/pail";
import { relative } from "@visulima/path";
import type { RollupWatcher, RollupWatcherEvent } from "rollup";
import { watch as rollupWatch } from "rollup";

import type { BuildContext } from "../types";
import type FileCache from "../utils/file-cache";
import { getRollupDtsOptions, getRollupOptions } from "./get-rollup-options";

const watchHandler = (watcher: RollupWatcher, mode: "bundle" | "types", logger: Pail<never, string>) => {
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

    watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "END") {
            logger.success({
                message: "Rebuild " + mode + " finished",
                prefix,
            });
        }

        if (event.code === "ERROR") {
            logger.error({
                context: [event.error],
                message: "Rebuild " + mode + " failed: " + event.error.message,
                prefix,
            });
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
