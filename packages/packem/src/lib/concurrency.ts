/**
 * Run async tasks with a concurrency limit to prevent memory overflow.
 * Useful for limiting parallel rollup builds, especially DTS generation.
 */
const runWithConcurrency = async <T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> => {
    if (tasks.length === 0) {
        return [];
    }

    const concurrencyLimit = limit <= 0 || !Number.isFinite(limit) ? Infinity : limit;
    const results: T[] = Array.from({ length: tasks.length });
    let currentIndex = 0;
    const runNext = async (): Promise<void> => {
        while (currentIndex < tasks.length) {
            const index = currentIndex;

            currentIndex += 1;
            const task = tasks[index];

            if (task) {
                // eslint-disable-next-line no-await-in-loop
                results[index] = await task();
            }
        }
    };
    // Start up to `limit` workers. `Array.from(_, mapFn)` invokes runNext()
    // once per slot — `Array.from({length}).fill(runNext())` would fill the
    // array with the same single promise and silently serialize all work.
    const workers = Array.from({ length: Math.min(concurrencyLimit, tasks.length) }, () => runNext());

    await Promise.all(workers);

    return results;
};

export default runWithConcurrency;
