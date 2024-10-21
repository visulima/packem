import { createHash } from "node:crypto";

const getHash = (data: string | NodeJS.ArrayBufferView): string => createHash("sha256").update(data).digest("hex");

export default getHash;
