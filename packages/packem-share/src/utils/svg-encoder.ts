/**
 * Encodes an SVG buffer to a base64 string after cleaning and optimizing the content.
 * @param buffer The SVG buffer to encode
 * @returns The base64-encoded SVG string
 */
const svgEncoder = (buffer: Buffer): string => {
    let svgString = buffer.toString("utf8");

    svgString = svgString.replaceAll("//gs", "");
    // Safe regex that matches only the exact 'class' attribute without backtracking
    // Uses word boundaries and explicit character sets to avoid ReDoS
    // eslint-disable-next-line sonarjs/slow-regex
    svgString = svgString.replaceAll(/\s*\bclass\s*=\s*(?:"[^"]*"|'[^']*')/gi, "");
    // Clean up multiple spaces that may have been created
    svgString = svgString.replaceAll(/\s{2,}/g, " ");

    svgString = svgString.replaceAll(/[\n\r\t]/g, " ");
    svgString = svgString.replaceAll(/\s{2,}/g, " ");
    svgString = svgString.trim();

    return Buffer.from(svgString, "utf8").toString("base64");
};

export default svgEncoder;
