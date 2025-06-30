const getRegexMatches = (regex: RegExp, source: string): string[] => {
    const internalRegex = regex;
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
