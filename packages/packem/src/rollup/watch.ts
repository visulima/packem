import { watch as fsWatch } from "node:fs";

import { cyan, gray } from "@visulima/colorize";
import { isAccessibleSync } from "@visulima/fs";
import type { FileCache } from "@visulima/packem-share";
import { enhanceRollupError } from "@visulima/packem-share";
import type { BuildContext } from "@visulima/packem-share/types";
import { join, relative } from "@visulima/path";
import type { RollupCache, RollupWatcher, RollupWatcherEvent, WatcherOptions } from "rollup";

import { getRollupOptions } from "../bundler/get-build-options";
import { getRollupWatch } from "../bundler/get-rollup";
import { PACKEM_CONFIG_FILES } from "../config/utils/find-packem-file";
import loadPackageJson from "../config/utils/load-package-json";
import prepareEntries from "../config/utils/prepare-entries";
import { getRolldownWatch } from "../rolldown/get-rolldown";
import { getRolldownOptions } from "../rolldown/get-rolldown-options";
import type { InternalBuildOptions } from "../types";
import { getRollupDtsOptions } from "./get-rollup-options";

/**
 * Minimal structural view of the Pail logger.
 *
 * `@visulima/pail`'s `dist/index.server.d.ts` re-exports `Pail` from a
 * non-existent `./pail.d.ts` (the real file is `./pail.server.d.ts`), so the
 * upstream `Pail` type used by `BuildContext.logger` resolves to an error type
 * and every `context.logger.*` access trips `no-unsafe-*`. Until the upstream
 * package fixes its re-export, narrow the logger to the methods used here; the
 * runtime object implements them.
 */
interface LogPayload {
    context?: unknown[];
    message: string;
    prefix: string;
}

interface Logger {
    error: (payload: LogPayload) => void;
    info: (message: LogPayload | string) => void;
    raw: (message: string) => void;
    success: (payload: LogPayload) => void;
}

const getLogger = (context: BuildContext<InternalBuildOptions>): Logger => context.logger as Logger;

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
    const logger = getLogger(context);

    watcher.on("change", async (id, { event }) => {
        await doOnSuccessCleanup?.();

        logger.info({
            message: `${cyan(relative(".", id))} was ${event}d`,
            prefix,
        });
    });

    watcher.on("restart", () => {
        logger.info({
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

                logger.raw(`\n⚡️ Build run in ${String(event.duration)}ms\n\n`);

                await runBuilder?.(true);

                break;
            }
            case "BUNDLE_START": {
                logger.info({
                    message: cyan(`build started...`),
                    prefix,
                });

                break;
            }
            case "END": {
                logger.success({
                    message: "Rebuild finished",
                    prefix,
                });

                await runOnsuccess?.();

                break;
            }
            case "ERROR": {
                enhanceRollupError(event.error);

                logger.error({
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

    getLogger(context).info(infoMessage);
};

type WatchOptions = WatcherOptions | false | undefined;

const buildMergedWatchOptions = (context: BuildContext<InternalBuildOptions>, currentWatch: WatcherOptions, userWatch: WatcherOptions): WatcherOptions => {
    const baseInclude: (string | RegExp)[] = [
        join(context.options.sourceDir, "**", "*"),
        "package.json",
        "packem.config.*",
        "tsconfig.json",
        "tsconfig.*.json",
    ];

    const { include: userInclude } = userWatch;

    if (Array.isArray(userInclude)) {
        baseInclude.push(...userInclude);
    } else if (userInclude !== undefined) {
        baseInclude.push(userInclude);
    }

    const existingChokidar = currentWatch.chokidar ?? {};
    const existingIgnored = (existingChokidar.ignored as unknown[] | undefined) ?? [];
    const ignored = ["**/.git/**", "**/node_modules/**", "**/test-results/**", ...existingIgnored];

    return {
        ...currentWatch,
        ...userWatch,
        chokidar: {
            cwd: context.options.rootDir,

            ...existingChokidar,
            ignored,
        },
        include: baseInclude,
    };
};

const configureWatchOptions = (context: BuildContext<InternalBuildOptions>, currentWatch: WatchOptions): WatchOptions => {
    const userWatch: WatchOptions = context.options.rollup.watch;

    const result: WatchOptions
        = !userWatch || typeof currentWatch !== "object" || currentWatch.include !== undefined
            ? currentWatch
            : buildMergedWatchOptions(context, currentWatch, userWatch);

    return result;
};

/**
 * Build rolldown's watch config. Rolldown watches the module graph itself and
 * does NOT understand rollup's `chokidar`/`include` shape — its `WatcherOptions`
 * takes glob `include`/`exclude` filters only. We default to excluding the noise
 * directories and forward the user's glob `include`/`exclude` if they set any.
 * (package.json / packem.config.* / tsconfig changes are handled separately by
 * the fs.watch restart below, since they are not part of the module graph.)
 */
const configureRolldownWatchOptions = (context: BuildContext<InternalBuildOptions>): Record<string, unknown> => {
    const exclude: (string | RegExp)[] = ["**/.git/**", "**/node_modules/**", "**/test-results/**"];
    const userWatch = context.options.rollup.watch;

    const result: Record<string, unknown> = { exclude };

    if (userWatch && typeof userWatch === "object") {
        if (userWatch.include !== undefined) {
            result.include = userWatch.include;
        }

        if (userWatch.exclude !== undefined) {
            exclude.push(...(Array.isArray(userWatch.exclude) ? userWatch.exclude : [userWatch.exclude]));
        }
    }

    return result;
};

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

    // Only `.close()` is used across both backends' watchers, so a structural
    // type keeps the array bundler-agnostic (rolldown's watcher is not a RollupWatcher).
    let watchers: { close: () => Promise<void> }[] = [];

    const isRolldown = context.options.bundler === "rolldown";

    const closeWatchers = async (): Promise<void> => {
        await Promise.all(watchers.map((w) => w.close()));
        watchers = [];
    };

    const startWatchers = async (): Promise<void> => {
        // Resolve the bundle watcher per backend, then run one shared block
        // (rollup:watch hook → logInputs → watchHandler → push) so the two
        // backends can't drift. Both early-return on empty input, so neither
        // starts a DTS watcher when there are no entries to build.
        let bundleWatcher: RollupWatcher;
        let bundleOptions: { input?: Record<string, string> | string | string[] };
        let bundleUseCache: boolean;

        if (isRolldown) {
            // Rolldown bundle watcher (native). DTS, when enabled, still watches
            // through rollup below — @visulima/rollup-plugin-dts isn't
            // rolldown-compatible yet.
            const rolldownWatch = await getRolldownWatch();
            const rolldownOptions = await getRolldownOptions(context, fileCache);

            await context.hooks.callHook("rollup:options", context, rolldownOptions);

            if (Object.keys(rolldownOptions.input ?? {}).length === 0) {
                return;
            }

            (rolldownOptions as Record<string, unknown>).watch = configureRolldownWatchOptions(context);

            bundleWatcher = rolldownWatch(rolldownOptions) as unknown as RollupWatcher;
            bundleOptions = rolldownOptions as { input?: Record<string, string> | string | string[] };
            // Rolldown manages its own incremental state; there is no rollup-style
            // serializable `cache`, so cache reuse is disabled for this watcher.
            bundleUseCache = false;
        } else {
            const rollupWatch = await getRollupWatch();
            const rollupOptions = await getRollupOptions(context, fileCache);

            await context.hooks.callHook("rollup:options", context, rollupOptions);

            if (Object.keys(rollupOptions.input ?? {}).length === 0) {
                return;
            }

            if (useCache) {
                rollupOptions.cache = fileCache.get<RollupCache>(WATCH_CACHE_KEY);
            }

            rollupOptions.watch = configureWatchOptions(context, rollupOptions.watch);

            bundleWatcher = rollupWatch(rollupOptions);
            bundleOptions = rollupOptions;
            bundleUseCache = useCache;
        }

        await context.hooks.callHook("rollup:watch", context, bundleWatcher);

        logInputs(context, bundleOptions);

        watchHandler({
            context,
            doOnSuccessCleanup,
            fileCache,
            mode: "bundle",
            runBuilder,
            runOnsuccess,
            useCache: bundleUseCache,
            watcher: bundleWatcher,
        });

        watchers.push(bundleWatcher);

        if (context.options.declaration) {
            const rollupWatch = await getRollupWatch();
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

    // Watch package.json and packem.config.* for changes. Rollup's watcher
    // only rebuilds with the same config — it can't pick up new entry points
    // or option changes. We close and restart the watchers when either file
    // changes, re-inferring entries from the updated package.json.
    const packageJsonPath = join(context.options.rootDir, "package.json");
    const configCandidates = PACKEM_CONFIG_FILES.map((file) => join(context.options.rootDir, file));

    let debounceTimer: ReturnType<typeof setTimeout>;

    const runRestart = async (changedFile: string, isConfigChange: boolean): Promise<void> => {
        const logger = getLogger(context);

        // A packem.config.* change can alter `context.options` (bundler,
        // transformer, output format, externals, …) which the running watch
        // session was built from. Reloading the full config here would require
        // re-running the entire jiti/preset/defu pipeline that lives in the CLI
        // command — too invasive for the watcher. Re-inferring entries off the
        // stale options would silently keep using the OLD config, so instead we
        // tell the user a manual restart is required and skip the misleading
        // "restarting watchers" rebuild.
        if (isConfigChange) {
            logger.info({
                message: `${relative(".", changedFile)} changed. Restart packem to apply configuration changes (the watcher cannot reload packem.config.* in place).`,
                prefix: "watcher",
            });

            return;
        }

        logger.info(`${relative(".", changedFile)} changed, restarting watchers...`);

        try {
            await closeWatchers();

            const { packageJson } = loadPackageJson(context.options.rootDir);

            context.pkg = packageJson;
            context.options.entries.length = 0;
            context.buildEntries.length = 0;
            await context.hooks.callHook("build:prepare", context);
            prepareEntries(context);

            await startWatchers();
        } catch (error) {
            logger.error({
                message: `Failed to restart watchers: ${(error as Error).message}`,
                prefix: "watcher",
            });
        }
    };

    const restart = (changedFile: string, isConfigChange: boolean): void => {
        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            runRestart(changedFile, isConfigChange).catch(() => {
                // runRestart already logs failures via its internal try/catch;
                // this guard only protects against an unexpected rejection.
            });
        }, 100);
    };

    // Don't add a SIGINT listener here — Node's default SIGINT behavior is
    // to terminate the process, and the OS reclaims these fs.watch handles
    // automatically. Adding a listener would override the default and leave
    // the rollup watcher + child onSuccess processes holding the event loop.
    fsWatch(packageJsonPath, () => {
        restart(packageJsonPath, false);
    });

    for (const configPath of configCandidates) {
        if (isAccessibleSync(configPath)) {
            fsWatch(configPath, () => {
                restart(configPath, true);
            });
            break;
        }
    }
};

export default watch;
