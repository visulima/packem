import { createHash } from "node:crypto";

const getHash = (data: NodeJS.ArrayBufferView | string): string => createHash("sha256").update(data).digest("hex");

export default getHash;
