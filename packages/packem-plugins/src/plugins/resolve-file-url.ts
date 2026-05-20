import { fileURLToPath } from "node:url";

import type { Plugin } from "rollup";

const resolveFileUrl = (): Plugin => {
    return {
        name: "packem:resolve-file-url",
        resolveId(id) {
            if (id.startsWith("file://")) {
                return fileURLToPath(id);
            }

            return undefined;
        },
    };
};

export default resolveFileUrl;
