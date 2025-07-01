import { createHash } from "node:crypto";

/**
 * Generates a SHA-256 hash of the provided data.
 * @param data The data to hash (buffer or string)
 * @returns The hexadecimal representation of the SHA-256 hash
 */
const getHash = (data: NodeJS.ArrayBufferView | string): string => createHash("sha256").update(data).digest("hex");

export default getHash;
