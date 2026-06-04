/**
 * Extracts the package name from a module path.
 * @param id The module path or identifier to extract the package name from
 * @returns The extracted package name
 */
const getPackageName = (id = ""): string => {
    const s = id.split("/");

    if ((s[0] as string).startsWith("@")) {
        // A bare scoped specifier with no subpath (e.g. "@scope") has no second
        // segment; return the scope as-is rather than producing "@scope/undefined".
        return s[1] === undefined ? (s[0] as string) : `${s[0] as string}/${s[1]}`;
    }

    return s[0] as string;
};

export default getPackageName;
