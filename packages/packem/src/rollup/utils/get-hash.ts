import { createHash } from "node:crypto";

const getHash = (data: string | NodeJS.ArrayBufferView): string => {
    const hash = createHash("md5");

    hash.update(data);

    return hash.digest("hex");
};

export default getHash;
