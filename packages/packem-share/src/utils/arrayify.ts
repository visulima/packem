/**
 * Ensures the input is an array. If it's not an array, wraps it in an array.
 * @param x - The input to arrayify
 * @returns An array containing the input
 */
const arrayify = <T>(x: T | T[]): T[] => {
    if (x === undefined || x === null) {
        return [] as T[];
    }

    return Array.isArray(x) ? x : ([x] as T[]);
};

export default arrayify;
