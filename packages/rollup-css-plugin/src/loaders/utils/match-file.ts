import type { Loader } from "../types";

/**
 * Tests whether a file matches a loader's test condition.
 *
 * This function handles different types of test conditions that can be
 * specified in a loader configuration:
 *
 * 1. **Function**: Calls the function with the file path
 * 2. **RegExp**: Uses the RegExp's test method
 * 3. **undefined/null**: Returns false (no match)
 * @param file File path to test against the condition
 * @param condition The test condition from a loader (function, RegExp, or undefined)
 * @returns True if the file matches the condition, false otherwise
 * @throws Error if the condition type is invalid/unsupported
 * @example
 * ```typescript
 * // Function-based matching
 * matchFile('styles.css', (file) => file.endsWith('.css')) // true
 *
 * // RegExp-based matching
 * matchFile('styles.sass', /\.(sass|scss)$/i) // false
 * matchFile('styles.scss', /\.(sass|scss)$/i) // true
 *
 * // No condition (undefined)
 * matchFile('any-file.txt', undefined) // false
 *
 * // Invalid condition throws error
 * matchFile('file.css', { invalid: 'condition' }) // throws Error
 * ```
 */
const matchFile = (file: string, condition: Loader["test"]): boolean => {
    if (!condition) {
        return false;
    }

    if (typeof condition === "function") {
        return condition(file);
    }

    if (typeof condition.test === "function") {
        return condition.test(file);
    }

    throw new Error("Invalid condition type");
};

export default matchFile;
