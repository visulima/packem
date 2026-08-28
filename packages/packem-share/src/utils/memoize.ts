/**
 * Modified copy of https://github.com/huozhi/bunchee/blob/main/src/lib/memoize.ts
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 these people -> https://github.com/huozhi/bunchee/graphs/contributors
 */
import stringify from "safe-stable-stringify";

type CacheKeyResolver = string | ((...arguments_: any[]) => string);

// NUL separator used to join the fast-path primitive key parts; it cannot appear
// in a normal module id. Hoisted so it isn't reallocated on every memoized call.
// eslint-disable-next-line unicorn/prefer-code-point -- e18e/prefer-string-fromcharcode wants the opposite for a BMP code point, and NUL is one
const KEY_SEPARATOR = String.fromCharCode(0);

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

        // Fast path for the common case (resolveId/transform helpers keyed by a
        // string/number id): build the key from primitive args directly in a
        // single pass, avoiding the cost of safe-stable-stringify. Each value is
        // prefixed with its type so distinct shapes (e.g. "1" vs 1) never
        // collide, joined with a NUL separator that cannot appear in a normal
        // module id, and prefixed with the arity to disambiguate argument counts.
        let key = String(arguments_.length);
        let isAllPrimitive = true;

        for (const argument of arguments_) {
            const type = typeof argument;

            if (type !== "string" && type !== "number" && type !== "boolean" && argument !== undefined && argument !== null) {
                isAllPrimitive = false;

                break;
            }

            key += `${KEY_SEPARATOR}${type}:${String(argument)}`;
        }

        if (isAllPrimitive) {
            return key;
        }

        // Slow path: non-primitive args fall back to (stable) JSON. NOTE: this
        // assumes the arguments are serializable — functions and symbols are
        // dropped by the serializer, so two calls differing only in a function/
        // symbol argument would collide on the same cache key. Callers that pass
        // non-serializable args should supply an explicit `cacheKey` resolver.
        return stringify({ args: arguments_ }) ?? JSON.stringify(arguments_);
    };

    const memoized = ((...arguments_: Parameters<T>) => {
        const key = resolveKey(arguments_);

        if (cache.has(key)) {
            return cache.get(key) as ReturnType<T>;
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
export const memoizeByKey = <T extends (...arguments_: any[]) => any>(function_: T): ((cacheKey?: CacheKeyResolver) => Memoized<T>) => {
    const cache = new Map<string, ReturnType<T>>();

    return (cacheKey?: CacheKeyResolver) => memoize(function_, cacheKey, cache);
};
