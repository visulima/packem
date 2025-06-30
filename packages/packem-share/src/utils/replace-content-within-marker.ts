/**
 * Replaces content within markers in a string
 * @param content The content to modify
 * @param marker The marker to find
 * @param replacement The replacement content
 * @returns The modified content or undefined if marker not found
 */
const replaceContentWithinMarker = (content: string, marker: string, replacement: string): string | undefined => {
    /** Replaces the content within the comments and re appends/prepends the comments to the replacement for follow-up workflow runs. */

    const regex = new RegExp(`(<!-- ${marker} -->)[\\s\\S]*?(<!-- /${marker} -->)`, "g");

    if (!regex.test(content)) {
        return undefined;
    }

    return content.replace(regex, `$1\n${replacement}\n$2`);
};

export default replaceContentWithinMarker;
