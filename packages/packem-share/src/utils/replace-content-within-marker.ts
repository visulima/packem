/**
 * Replaces content within markers in a string.
 * @param content The content to modify
 * @param marker The marker string to find within the content
 * @param replacement The replacement content to insert between markers
 * @returns The modified content or undefined if marker not found
 */
/** Escapes regex metacharacters so an arbitrary `marker` is matched literally. */
const escapeRegExp = (value: string): string => value.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

const replaceContentWithinMarker = (content: string, marker: string, replacement: string): string | undefined => {
    /** Replaces the content within the comments and re appends/prepends the comments to the replacement for follow-up workflow runs. */

    const escapedMarker = escapeRegExp(marker);
    const regex = new RegExp(String.raw`(<!-- ${escapedMarker} -->)[\s\S]*?(<!-- /${escapedMarker} -->)`, "g");

    if (!regex.test(content)) {
        return undefined;
    }

    // Pass `replacement` through a replacer function so `$&`, `$'`, `$1`, `$$`
    // sequences in third-party text (e.g. harvested license bodies) are treated
    // literally instead of as String.replace substitution patterns. The marker
    // group references are reconstructed from `match.replace` on the captured
    // delimiters, which are static (already escaped) so they cannot inject.
    return content.replace(regex, (_match, open: string, close: string) => `${open}\n${replacement}\n${close}`);
};

export default replaceContentWithinMarker;
