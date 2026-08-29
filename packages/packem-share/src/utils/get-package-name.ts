/**
 * Extracts the package name from a module path.
 * @param id The module path or identifier to extract the package name from
 * @returns The extracted package name
 */
const getPackageName = (id = ""): string => {
    // `String.split` always yields at least one element, so `first` is never the
    // default; the default only satisfies `noUncheckedIndexedAccess` without a cast.
    const [first = "", second] = id.split("/", 2);

    if (first.startsWith("@")) {
        // A bare scoped specifier with no subpath (e.g. "@scope") has no second
        // segment; return the scope as-is rather than producing "@scope/undefined".
        return second === undefined ? first : `${first}/${second}`;
    }

    return first;
};

export default getPackageName;
