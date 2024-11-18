const splitTsconfigPathKey = (key: string): string[] => {
    if (!key || typeof key !== "string") {
        throw new Error("Invalid key: Key must be a non-empty string.");
    }

    const result: string[] = [];
    const namespaceRegex = /^([\w-]+):/;

    // Extract namespace if present
    const namespaceMatch = namespaceRegex.exec(key);

    if (namespaceMatch) {
        result.push(namespaceMatch[1] as string);

        // eslint-disable-next-line no-param-reassign
        key = key.replace(namespaceRegex, ""); // Remove namespace from the key
    }

    // Split remaining path by "/" and handle wildcard
    const parts = key.split("/");

    for (const part of parts) {
        if (part.includes("*") || part) {
            result.push(part); // Add wildcard directly or normal path segment
        }
    }

    return result;
};

export default splitTsconfigPathKey;
