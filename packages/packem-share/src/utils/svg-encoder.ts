import { stripSvgComments } from "./svg-data-uri";

/**
 * Encodes an SVG buffer to a base64 string after cleaning and optimizing the content.
 * @param buffer The SVG buffer to encode
 * @returns The base64-encoded SVG string
 */
const svgEncoder = (buffer: Buffer): string => {
    let svgString = buffer.toString("utf8");

    // Strip real XML/HTML comments so they are not carried into the inlined,
    // base64-encoded asset (shared helper, linear scan).
    svgString = stripSvgComments(svgString);
    // Safe regex that matches only the exact 'class' attribute without backtracking
    // Uses word boundaries and explicit character sets to avoid ReDoS
    // eslint-disable-next-line sonarjs/slow-regex
    svgString = svgString.replaceAll(/\s*\bclass\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
    // Normalize all whitespace (newlines, tabs, runs of spaces) in a single pass,
    // then trim. Folding the previous separate `\s{2,}` / `[\n\r\t]` / `\s{2,}`
    // passes into one `\s+` collapse keeps the output identical.
    svgString = svgString.replaceAll(/\s+/g, " ").trim();

    return Buffer.from(svgString, "utf8").toString("base64");
};

export default svgEncoder;
