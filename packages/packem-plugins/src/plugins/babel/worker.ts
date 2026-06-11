import workerpool from "workerpool";

import type { TransformCodeOptions, TransformCodeResult } from "./transform-code";
import { MISSING_OPTIONS_SENTINEL, transformCode } from "./transform-code";

/**
 * Worker entry point for parallel Babel transforms.
 *
 * Spawned by {@link workerpool} (one thread per pool slot) from the babel plugin
 * when a build is large enough to benefit from parallelism. Each `transform` call
 * runs the exact same {@link transformCode} routine used on the main thread, so the
 * output is identical regardless of which path produced it.
 *
 * The Babel transform options are constant for the whole build, so re-sending (and
 * structured-cloning) them with every file is pure waste. Instead the main thread
 * sends them once keyed by a stable `optionsKey`; this worker caches them in module
 * scope and subsequent calls pass only `(code, id, optionsKey)`. workerpool
 * round-robins tasks across workers and cannot target a specific worker, so a worker
 * that has not yet seen a given key reports a sentinel; the main thread then retries
 * that single call with the full options payload (see {@link MISSING_OPTIONS_SENTINEL}).
 */
const optionsByKey = new Map<string, TransformCodeOptions>();

const transform = async (
    sourcecode: string,
    id: string,
    optionsKey: string,
    options?: TransformCodeOptions,
): Promise<TransformCodeResult | undefined> => {
    if (options !== undefined) {
        optionsByKey.set(optionsKey, options);
    }

    const cached = optionsByKey.get(optionsKey);

    if (cached === undefined) {
        // This worker has never received the full options for this key. Signal the
        // main thread to retry with the payload attached; it caches here for next time.
        throw new Error(MISSING_OPTIONS_SENTINEL);
    }

    return transformCode(sourcecode, id, cached);
};

workerpool.worker({
    transform,
});
