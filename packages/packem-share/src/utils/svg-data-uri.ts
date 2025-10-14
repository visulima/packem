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

const stripSvgComments = (input: string): string => input.replaceAll(/<!--[\s\S]*?-->/g, "");

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
    const cleanSvg = svgString
        .replaceAll(/<!--[\s\S]*?-->/g, "")
        .replaceAll(/\s+/g, " ")
        .trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
};
