const REGEX = {
    quotes: /"/g,
    urlHexPairs: /%[\dA-F]{2}/g,
    whitespace: /\s+/g,
};

const specialHexEncode = (match: string): string => {
    switch (match) {
        case "%2F": {
            return "/";
        }
        case "%3A": {
            return ":";
        }
        case "%3D": {
            return "=";
        }
        case "%20": {
            return " ";
        }
        default: {
            return match.toLowerCase();
        }
    }
};

const collapseWhitespace = (input: string): string => input.trim().replaceAll(REGEX.whitespace, " ");
const dataUriPayload = (input: string): string => encodeURIComponent(input).replaceAll(REGEX.urlHexPairs, specialHexEncode);

/**
 * Strips XML/HTML comments from an SVG string.
 *
 * Uses a linear `indexOf` scan rather than a lazy comment regex, whose
 * quantifier degrades to roughly quadratic on inputs with many unclosed comment
 * openers. An unterminated comment drops the remainder, matching the regex's
 * behaviour of only removing a balanced comment.
 * @param input The SVG string to strip comments from
 * @returns The SVG string without comments
 */
export const stripSvgComments = (input: string): string => {
    let result = "";
    let index = 0;

    for (;;) {
        const start = input.indexOf("<!--", index);

        if (start === -1) {
            result += input.slice(index);

            break;
        }

        result += input.slice(index, start);

        const end = input.indexOf("-->", start + 4);

        if (end === -1) {
            // Unterminated comment: drop the rest, mirroring the lazy regex.
            break;
        }

        index = end + 3;
    }

    return result;
};

/**
 * Converts SVG to a tiny, optimized data URI for minimal size.
 * @param svgString The SVG string to optimize
 * @returns Optimized SVG data URI with charset specification
 */
export const svgToTinyDataUri = (svgString: string): string => {
    const withoutBom = svgString.startsWith("\uFEFF") ? svgString.slice(1) : svgString;
    const noComments = stripSvgComments(withoutBom);
    const body = collapseWhitespace(noComments).replaceAll(REGEX.quotes, "'");

    return `data:image/svg+xml;charset=utf-8,${dataUriPayload(body)}`;
};

/**
 * Converts SVG to a CSS-optimized data URI for better CSS compatibility.
 * @param svgString The SVG string to optimize
 * @returns CSS-optimized SVG data URI with charset specification
 */
export const svgToCssDataUri = (svgString: string): string => {
    const cleanSvg = stripSvgComments(svgString).replaceAll(/\s+/g, " ").trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
};
