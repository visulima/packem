/**
 * Extracts all matches from a string using the provided regular expression.
 * @param regex The regular expression to use for matching
 * @param source The source string to search within
 * @returns An array of all matched strings, filtered to remove empty matches
 */
const getRegexMatches = (regex: RegExp, source: string): string[] => {
    // A non-global regex never advances `lastIndex`, so the loop below would
    // restart at index 0 forever. Use a global-flagged clone in that case.
    // Cloning also keeps the function side-effect free (the caller's regex
    // `lastIndex` is never mutated).
    const internalRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
    const matches: string[] = [];

    let regexMatches;

    // eslint-disable-next-line no-cond-assign
    while ((regexMatches = internalRegex.exec(source)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (regexMatches.index === internalRegex.lastIndex) {
            // eslint-disable-next-line no-plusplus
            internalRegex.lastIndex++;
        }

        regexMatches.forEach((match) => {
            matches.push(match);
        });
    }

    return matches.filter(Boolean);
};

export default getRegexMatches;
