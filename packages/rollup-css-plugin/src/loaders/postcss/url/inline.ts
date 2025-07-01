/* eslint-disable import/no-extraneous-dependencies, no-secrets/no-secrets */
import liteMime from "mime/lite";

/**
 * Converts a file to a data URI for inline embedding in CSS.
 *
 * Creates a base64-encoded data URI that can be used directly in CSS
 * without requiring a separate file request.
 * @param file File path used to determine MIME type
 * @param source File content as Uint8Array to be base64 encoded
 * @returns Data URI string in format "data:mime/type;base64,encodedContent"
 * @example
 * ```ts
 * inlineFile("image.png", pngBuffer)
 * // Returns: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
 * ```
 */
const inline = (file: string, source: Uint8Array): string => {
    const mime = liteMime.getType(file) ?? "application/octet-stream";
    const data = Buffer.from(source).toString("base64");

    return `data:${mime};base64,${data}`;
};

export default inline;
