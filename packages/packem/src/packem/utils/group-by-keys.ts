type Key = number | string | symbol;

/**
 * Stringifies a grouping key value. Primitives are coerced directly; anything
 * else falls back to a JSON representation so object keys do not collapse into
 * the useless `[object Object]` form.
 */
const toGroupKey = (value: unknown): string => {
    if (value === undefined || value === null) {
        return "undefined";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "symbol") {
        return value.toString();
    }

    return JSON.stringify(value);
};

/**
 * Returns the existing value for `key`, creating and storing it with `factory` when absent.
 */
const getOrCreate = <K, V>(map: Map<K, V>, key: K, factory: () => V): V => {
    let value = map.get(key);

    if (value === undefined) {
        value = factory();
        map.set(key, value);
    }

    return value;
};

/**
 * Groups an array of objects by multiple keys, creating nested objects.
 * Supports 2 or 3 keys for grouping.
 * @param array Array of objects to group
 * @param key1 First key to group by
 * @param key2 Second key to group by
 * @param key3 Optional third key to group by
 * @returns Nested object grouped by the specified keys
 */
const groupByKeys = <T extends Record<Key, unknown>>(
    array: T[],
    key1: Key,
    key2: Key,
    key3?: Key,
): Record<string, Record<string, T[]>> | Record<string, Record<string, Record<string, T[]>>> => {
    if (key3 !== undefined) {
        // Group by 3 keys
        const threeLevel = new Map<string, Map<string, Map<string, T[]>>>();

        for (const currentItem of array) {
            const level1 = getOrCreate(threeLevel, toGroupKey(currentItem[key1]), () => new Map<string, Map<string, T[]>>());
            const level2 = getOrCreate(level1, toGroupKey(currentItem[key2]), () => new Map<string, T[]>());
            const bucket = getOrCreate(level2, toGroupKey(currentItem[key3]), () => []);

            bucket.push(currentItem);
        }

        const threeResult: Record<string, Record<string, Record<string, T[]>>> = {};

        for (const [k1, level1] of threeLevel) {
            const inner: Record<string, Record<string, T[]>> = {};

            for (const [k2, level2] of level1) {
                inner[k2] = Object.fromEntries(level2);
            }

            threeResult[k1] = inner;
        }

        return threeResult;
    }

    // Group by 2 keys (original behavior)
    const twoLevel = new Map<string, Map<string, T[]>>();

    for (const currentItem of array) {
        const level1 = getOrCreate(twoLevel, toGroupKey(currentItem[key1]), () => new Map<string, T[]>());
        const bucket = getOrCreate(level1, toGroupKey(currentItem[key2]), () => []);

        bucket.push(currentItem);
    }

    const twoResult: Record<string, Record<string, T[]>> = {};

    for (const [k1, level1] of twoLevel) {
        twoResult[k1] = Object.fromEntries(level1);
    }

    return twoResult;
};

export default groupByKeys;
