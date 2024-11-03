/**
 * Modified copy of https://github.com/huozhi/bunchee/blob/main/src/lib/memoize.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/bunchee/graphs/contributors
 */
import stringify from "safe-stable-stringify";

type CacheKeyResolver = string | ((...arguments_: any[]) => string);

/**
 * A memoized function with an additional `destroy` method to clear its cache.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Memoized<T extends (...arguments_: any[]) => any> = T & {
    /**
     * Manually clear the underlying cache to avoid memory leaks.
     */
    destroy: () => void;
};

/**
 * Creates a memoized version of a function that caches results based on input arguments.
 * @param function_ The function to memoize
 * @param cacheKey Optional cache key resolver (string or function)
 * @param cacheArgument Optional existing cache map to use
 * @returns The memoized function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const memoize = <T extends (...arguments_: any[]) => any>(
    function_: T,
    cacheKey?: CacheKeyResolver, // if you need specify a cache key
    cacheArgument?: Map<string, ReturnType<T>>,
): Memoized<T> => {
    const cache: Map<string, ReturnType<T>> = cacheArgument ?? new Map<string, ReturnType<T>>();

    const resolveKey = (arguments_: Parameters<T>): string => {
        if (cacheKey) {
            return typeof cacheKey === "function" ? cacheKey(...arguments_) : cacheKey;
        }

        return stringify({ args: arguments_ }) ?? JSON.stringify(arguments_);
    };

    const memoized = ((...arguments_: Parameters<T>) => {
        const key = resolveKey(arguments_);
        const existing = cache.get(key);

        if (existing !== undefined) {
            return existing;
        }

        const result = function_(...arguments_) as ReturnType<T>;

        cache.set(key, result);

        return result;
    }) as Memoized<T>;

    memoized.destroy = () => {
        cache.clear();
    };

    return memoized;
};

/**
 * Creates a function that returns memoized versions of the input function with shared cache.
 * @param function_ The function to create memoized versions of
 * @returns A function that returns memoized versions with optional cache key
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const memoizeByKey = <T extends (...arguments_: any[]) => any>(function_: T): (cacheKey?: CacheKeyResolver) => Memoized<T> => {
    const cache = new Map<string, ReturnType<T>>();

    return (cacheKey?: CacheKeyResolver) => memoize(function_, cacheKey, cache);
};
