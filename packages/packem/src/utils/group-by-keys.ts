type Key = string | number | symbol;

const groupByKeys = <T extends Record<Key, unknown>>(array: T[], key1: Key, key2: Key): Record<string, Record<string, T[]>> =>
    // eslint-disable-next-line unicorn/no-array-reduce
    array.reduce<Record<string, Record<string, T[]>>>((result, currentItem) => {
        const groupKey1 = currentItem[key1] as string;
        const groupKey2 = currentItem[key2] as string;

        if (!result[groupKey1]) {
            // eslint-disable-next-line no-param-reassign
            result[groupKey1] = {};
        }

        if (!result[groupKey1][groupKey2]) {
            // eslint-disable-next-line no-param-reassign
            result[groupKey1][groupKey2] = [];
        }

        // eslint-disable-next-line security/detect-object-injection
        result[groupKey1][groupKey2].push(currentItem);

        return result;
    }, {});

export default groupByKeys;
