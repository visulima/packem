/**
 * Formats an array of strings into a human-readable list format.
 *
 * Converts an array into a grammatically correct string with proper conjunctions:
 * - Single item: "`item`"
 * - Two items: "`item1` or `item2`"
 * - Multiple items: "`item1`, `item2`, or `item3`"
 * @param array Array of strings to format
 * @returns Formatted string with proper conjunctions and backticks
 * @example
 * ```typescript
 * arrayFmt(['inject']) // "`inject`"
 * arrayFmt(['inject', 'extract']) // "`inject` or `extract`"
 * arrayFmt(['inject', 'extract', 'emit']) // "`inject`, `extract`, or `emit`"
 * ```
 */
const arrayFmt = (array: string[]): string =>
    array
        .map((id, index, array_) => {
            const fmt = `\`${id}\``;

            switch (index) {
                case array_.length - 1: {
                    return `or ${fmt}`;
                }
                case array_.length - 2: {
                    return fmt;
                }
                default: {
                    return `${fmt},`;
                }
            }
        })
        .join(" ");

export default arrayFmt;
