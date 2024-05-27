type CacheKeyResolver = string | ((...arguments_: any[]) => string);

const memoize = <T extends (...arguments_: any[]) => any>(
    function_: T,
    cacheKey?: CacheKeyResolver, // if you need specify a cache key
    cacheArgument?: Map<string, ReturnType<T>>,
) => {
    const cache: Map<string, ReturnType<T>> = cacheArgument ?? new Map();

    return ((...arguments_: Parameters<T>) => {
        const key = cacheKey ? (typeof cacheKey === "function" ? cacheKey(...arguments_) : cacheKey) : JSON.stringify({ args: arguments_ });
        const existing = cache.get(key);

        if (existing !== undefined) {
            return existing;
        }

        const result = function_(...arguments_);

        cache.set(key, result);

        return result;
    }) as T;
};

const memoizeByKey = <T extends (...arguments_: any[]) => any>(function_: T) => {
    const cache = new Map<string, ReturnType<T>>();

    return (cacheKey?: CacheKeyResolver) => memoize(function_, cacheKey, cache);
};

export default memoizeByKey;
