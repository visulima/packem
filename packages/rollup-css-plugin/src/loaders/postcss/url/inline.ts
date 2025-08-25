/* eslint-disable import/no-extraneous-dependencies, no-secrets/no-secrets */
import liteMime from "mime/lite";

/**
 * Converts a file to a data URI for inline embedding in CSS.
 *
 * Creates a data URI that can be used directly in CSS
 * without requiring a separate file request. All files are encoded
 * using base64 for consistent behavior.
 * @param file File path used to determine MIME type
 * @param source File content as Uint8Array to be encoded
 * @returns Data URI string optimized for CSS usage
 * @example
 * ```ts
 * inlineFile("image.png", pngBuffer)
 * // Returns: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 *
 * inlineFile("icon.svg", svgBuffer)
 * // Returns: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDov..."
 * ```
 */
const inline = (file: string, source: Uint8Array): string => {
    const mime = liteMime.getType(file) ?? "application/octet-stream";
    const data = Buffer.from(source).toString("base64");

    return `data:${mime};base64,${data}`;
};

export default inline;
