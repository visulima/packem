/**
 * Checks if an array contains a search element, supporting both string and regex matching.
 * @param array Array of strings or regular expressions to search through
 * @param searchElement The string element to search for
 * @returns True if the array contains the search element, false otherwise
 */
const arrayIncludes = (array: (RegExp | string)[], searchElement: string): boolean =>
    array.some((entry) => (entry instanceof RegExp ? entry.test(searchElement) : entry === searchElement));

export default arrayIncludes;
