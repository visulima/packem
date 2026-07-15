import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { InputOptions as TransformOptions } from "@babel/core";
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";
import type { Pool } from "workerpool";
import workerpool from "workerpool";

import type { TransformCodeOptions, TransformCodeResult } from "./transform-code";
import { MISSING_OPTIONS_SENTINEL, OPTIONS_KEY, transformCode } from "./transform-code";

/** Default number of matched files before the worker pool is created. */
const DEFAULT_PARALLEL_THRESHOLD = 20;

/** Default worker cap. Benefits diminish past this point because of per-worker setup cost. */
const DEFAULT_MAX_WORKERS = 4;

/**
 * Location of the worker entry relative to a consuming package's `dist` root.
 * The consuming package copies the built worker (and the transform-code chunk it
 * imports) into `dist/babel-runtime/`, preserving the worker's own relative import
 * depth (hence the `plugins/babel/` nesting). This path is the contract between
 * that copy step and `resolveWorkerScript`.
 */
const WORKER_RELATIVE_PATH = join("babel-runtime", "plugins", "babel", "worker.js");

/**
 * Returns the key of the first non-serializable own property of `value`, or
 * `undefined` when every property can safely cross a worker thread boundary.
 * Functions, symbols and other non-cloneable values are what disqualify parallel mode.
 */
const findNonSerializableOption = (value: Record<string, unknown>): string | undefined => {
    const isSerializable = (input: unknown): boolean => {
        if (input === null) {
            return true;
        }

        if (Array.isArray(input)) {
            return input.every((item) => isSerializable(item));
        }

        switch (typeof input) {
            case "boolean":
            case "number":
            case "string":
            case "undefined": {
                return true;
            }
            case "object": {
                return Object.values(input as Record<string, unknown>).every((item) => isSerializable(item));
            }
            default: {
                return false;
            }
        }
    };

    for (const key of Object.keys(value)) {
        if (!isSerializable(value[key])) {
            return key;
        }
    }

    return undefined;
};

/**
 * Locates the standalone worker script. It is copied to the consuming package's
 * `dist` root at build time, so we walk up from this module (which may itself live
 * in a hashed shared chunk) until we find it. Returns `undefined` when running from
 * source (dev/test) or when the file is otherwise absent, signalling the caller to
 * stay in-process.
 */
const resolveWorkerScript = (): string | undefined => {
    let directory: string;

    try {
        directory = dirname(fileURLToPath(import.meta.url));
    } catch {
        return undefined;
    }

    // Bounded upward walk: the plugin runs from the dist root or a nested chunk
    // directory a level or two below it; the worker lives under the dist root.
    for (let depth = 0; depth < 6; depth += 1) {
        const candidate = join(directory, WORKER_RELATIVE_PATH);

        if (existsSync(candidate)) {
            return candidate;
        }

        const parent = dirname(directory);

        if (parent === directory) {
            break;
        }

        directory = parent;
    }

    return undefined;
};

export interface BabelPluginConfig extends Omit<TransformOptions, "exclude" | "filename" | "include" | "sourceFileName"> {
    exclude?: FilterPattern;
    filename?: string;
    include?: FilterPattern;

    /**
     * Optional logger used to surface diagnostics — e.g. why parallel mode fell back
     * to in-process transforms (non-serializable option, missing worker script). When
     * omitted, fallbacks happen silently (preserving prior behaviour).
     */
    logger?: Pick<Console, "debug" | "warn">;

    /**
     * Run Babel transforms in parallel across a worker pool.
     * `false` always transforms in-process; `true`/`undefined` auto-enables workers
     * once the build crosses `parallelThreshold` matched files (so small builds never
     * pay the worker startup cost); a number caps the worker count (default min(cpus, 4)).
     * Parallel mode requires fully serializable Babel options — when a non-serializable
     * option is present (e.g. a function plugin, or a `babel` config supplied as a
     * function) the plugin silently falls back to in-process transforms.
     * @default true
     */
    parallel?: boolean | number;

    /**
     * Minimum number of matched files before the worker pool is created.
     * @default 20
     */
    parallelThreshold?: number;
    sourceFileName?: string;
}

export const babelTransformPlugin = ({
    exclude,
    generatorOpts,
    include,
    logger,
    parallel = true,
    parallelThreshold = DEFAULT_PARALLEL_THRESHOLD,
    ...transformOptions
}: BabelPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    // The constant per-build portion of the transform options. Any build-wide
    // `filename`/`sourceFileName` that flows in via `...transformOptions` is
    // intentionally ignored downstream: transformCode derives both from each module's
    // `id`, so a single build-wide value never leaks into every module's Babel run
    // (which would change per-file preset/override behaviour).
    const baseTransformOptions: TransformCodeOptions = { ...transformOptions, generatorOpts };

    let matchedCount = 0;
    let workerPool: Pool | undefined;
    // Once true, parallel mode is permanently off for this build (opted out,
    // non-serializable options, or worker script not found). `parallel <= 0` (or
    // `false`) means "disabled" — a worker count of 0 would otherwise be treated as a
    // pool size and break.
    let parallelDisabled = parallel === false || (typeof parallel === "number" && parallel <= 0);

    const ensurePool = (): Pool | undefined => {
        if (parallelDisabled) {
            return undefined;
        }

        if (workerPool) {
            return workerPool;
        }

        // Auto-on above N matched files: stay in-process until the build is large
        // enough to amortize worker startup.
        if (matchedCount < parallelThreshold) {
            return undefined;
        }

        const nonSerializableKey = findNonSerializableOption(baseTransformOptions as Record<string, unknown>);

        if (nonSerializableKey !== undefined) {
            parallelDisabled = true;

            logger?.warn(
                `[packem:babel] Parallel transforms disabled: the Babel option "${nonSerializableKey}" is not serializable across a worker thread (e.g. a function plugin/preset or a function-form babel config). Falling back to in-process transforms.`,
            );

            return undefined;
        }

        const script = resolveWorkerScript();

        if (!script) {
            parallelDisabled = true;

            logger?.debug(
                "[packem:babel] Parallel transforms disabled: the worker script was not found on disk (running from source, or the build did not copy it into dist/babel-runtime/). Falling back to in-process transforms.",
            );

            return undefined;
        }

        // Clamp to >= 1: `cpus()` can return `[]` in some containers, making
        // `Math.min(cpus().length, cap)` zero, which would create a 0-worker pool.
        const maxWorkers = typeof parallel === "number" ? Math.max(1, parallel) : Math.max(1, Math.min(cpus().length, DEFAULT_MAX_WORKERS));

        workerPool = workerpool.pool(script, { maxWorkers, workerType: "thread" });

        return workerPool;
    };

    return <Plugin>{
        async closeBundle() {
            if (!this.meta.watchMode) {
                await workerPool?.terminate();
                workerPool = undefined;
            }
        },

        async closeWatcher() {
            await workerPool?.terminate();
            workerPool = undefined;
        },

        name: "packem:babel",

        async transform(sourcecode, id) {
            if (!filter(id)) {
                return undefined;
            }

            matchedCount += 1;

            const pool = ensurePool();

            if (pool) {
                // The transform options are constant for the whole build, so they are
                // sent (and structured-cloned) once per worker keyed by `OPTIONS_KEY`,
                // not re-cloned for every file. Each worker caches them in module scope
                // and subsequent calls pass only `(code, id, OPTIONS_KEY)`. Because
                // workerpool round-robins and we cannot target a worker, a worker that
                // has not yet seen the key throws MISSING_OPTIONS_SENTINEL; we retry that
                // single call once with the full payload attached.
                type PoolResult = TransformCodeResult | undefined;

                try {
                    return (await pool.exec("transform", [sourcecode, id, OPTIONS_KEY])) as PoolResult;
                } catch (error: unknown) {
                    if (error instanceof Error && error.message.includes(MISSING_OPTIONS_SENTINEL)) {
                        return (await pool.exec("transform", [sourcecode, id, OPTIONS_KEY, baseTransformOptions])) as PoolResult;
                    }

                    throw error;
                }
            }

            const result = await transformCode(sourcecode, id, baseTransformOptions);

            if (!result) {
                return undefined;
            }

            return {
                code: result.code,
                map: result.map ?? undefined,
            };
        },
    };
};
