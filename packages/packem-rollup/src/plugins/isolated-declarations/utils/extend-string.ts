import splitTsconfigPathKey from "./split-tsconfig-path-key";

const extendString = (baseString: string, referenceString: string): string => {
    // Remove leading './' or '../' for accurate comparison
    const baseNormalized = baseString.replace(/^\.\//, "");
    const referenceNormalized = referenceString.replace(/^\.\//, "");

    // If the reference string starts with the normalized base string, return the reference string
    if (referenceNormalized.startsWith(baseNormalized)) {
        return baseString + referenceNormalized.slice(baseNormalized.length);
    }

    if (baseString.endsWith(referenceString)) {
        return baseString;
    }

    // Split both strings into components
    const baseParts = splitTsconfigPathKey(baseString);
    const referenceParts = splitTsconfigPathKey(referenceString);

    // Find the first differing index, starting from the end
    let baseIndex = baseParts.length - 1;
    let referenceIndex = referenceParts.length - 1;

    while (baseIndex >= 0 && referenceIndex >= 0 && baseParts[baseIndex] === referenceParts[referenceIndex]) {
        // eslint-disable-next-line no-plusplus
        baseIndex--;
        // eslint-disable-next-line no-plusplus
        referenceIndex--;
    }

    let commonBase = baseParts.slice(0, baseIndex).join("/");
    const missingPart = referenceParts.slice(referenceIndex).join("/");

    if (!commonBase.startsWith(".") || commonBase === "") {
        commonBase = `./${commonBase}`;
    }

    return commonBase + (missingPart ? `/${missingPart}` : "");
};

export default extendString;
