const replaceContentWithin = (content: string, marker: string, replacement: string): string | undefined => {
    /** Replaces the content within the comments and re appends/prepends the comments to the replacement for follow-up workflow runs. */
    // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
    const regex = new RegExp(`(<!-- ${marker} -->)[\\s\\S]*?(<!-- /${marker} -->)`, "g");

    if (!regex.test(content)) {
        return undefined;
    }

    return content.replace(regex, `$1\n${replacement}\n$2`);
};

export default replaceContentWithin;
