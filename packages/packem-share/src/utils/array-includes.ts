/**
 * Checks if an array contains a search element, supporting both string and regex matching.
 * @param array Array of strings or regular expressions to search through
 * @param searchElement The string element to search for
 */
const arrayIncludes = (array: (RegExp | string)[], searchElement: string): boolean =>
    // eslint-disable-next-line @stylistic/no-extra-parens
    array.some((entry) => (entry instanceof RegExp ? entry.test(searchElement) : entry === searchElement));

export default arrayIncludes;
