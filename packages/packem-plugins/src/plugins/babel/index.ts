import { existsSync } from "node:fs";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TransformOptions } from "@babel/core";
import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { Plugin } from "rollup";
import type { Pool } from "workerpool";
import workerpool from "workerpool";

import type { TransformCodeOptions } from "./transform-code";
import { transformCode } from "./transform-code";

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
    filename,
    generatorOpts,
    include,
    parallel = true,
    parallelThreshold = DEFAULT_PARALLEL_THRESHOLD,
    sourceFileName,
    ...transformOptions
}: BabelPluginConfig): Plugin => {
    const filter = createFilter(include, exclude ?? EXCLUDE_REGEXP);

    // The constant per-build portion of the transform options. `filename`/
    // `sourceFileName` are filled in per file (always strings, always serializable),
    // so this object is sufficient for the one-time serializability check.
    const baseTransformOptions: TransformCodeOptions = { ...transformOptions, filename, generatorOpts, sourceFileName };

    let matchedCount = 0;
    let workerPool: Pool | undefined;
    // Once true, parallel mode is permanently off for this build (opted out,
    // non-serializable options, or worker script not found).
    let parallelDisabled = parallel === false;

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

        if (findNonSerializableOption(baseTransformOptions as Record<string, unknown>) !== undefined) {
            parallelDisabled = true;

            return undefined;
        }

        const script = resolveWorkerScript();

        if (!script) {
            parallelDisabled = true;

            return undefined;
        }

        const maxWorkers = typeof parallel === "number" ? parallel : Math.min(cpus().length, DEFAULT_MAX_WORKERS);

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
                // The worker runs the identical transformCode routine; a per-file
                // `filename`/`sourceFileName` default is applied inside it from `id`.
                return pool.exec("transform", [sourcecode, id, baseTransformOptions]) as Promise<{ code: string; map: TransformOptions["inputSourceMap"] } | undefined>;
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
