type Key = number | string | symbol;

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
        // eslint-disable-next-line unicorn/no-array-reduce
        return array.reduce<Record<string, Record<string, Record<string, T[]>>>>((result, currentItem) => {
            const groupKey1 = String(currentItem[key1] ?? "undefined");
            const groupKey2 = String(currentItem[key2] ?? "undefined");
            const groupKey3 = String(currentItem[key3] ?? "undefined");

            if (!result[groupKey1]) {
                // eslint-disable-next-line no-param-reassign
                result[groupKey1] = {};
            }

            if (!result[groupKey1][groupKey2]) {
                // eslint-disable-next-line no-param-reassign
                result[groupKey1][groupKey2] = {};
            }

            if (!result[groupKey1][groupKey2][groupKey3]) {
                // eslint-disable-next-line no-param-reassign
                result[groupKey1][groupKey2][groupKey3] = [];
            }

            result[groupKey1][groupKey2][groupKey3].push(currentItem);

            return result;
        }, {});
    }

    // Group by 2 keys (original behavior)
    // eslint-disable-next-line unicorn/no-array-reduce
    return array.reduce<Record<string, Record<string, T[]>>>((result, currentItem) => {
        const groupKey1 = String(currentItem[key1] ?? "undefined");
        const groupKey2 = String(currentItem[key2] ?? "undefined");

        if (!result[groupKey1]) {
            // eslint-disable-next-line no-param-reassign
            result[groupKey1] = {};
        }

        if (!result[groupKey1][groupKey2]) {
            // eslint-disable-next-line no-param-reassign
            result[groupKey1][groupKey2] = [];
        }

        result[groupKey1][groupKey2].push(currentItem);

        return result;
    }, {});
};

export default groupByKeys;
