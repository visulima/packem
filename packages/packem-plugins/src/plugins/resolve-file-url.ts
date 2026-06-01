import { fileURLToPath } from "node:url";

import type { Plugin } from "rollup";

const FILE_URL_RE = /^file:\/\//;

const resolveFileUrl = (): Plugin => {
    return {
        name: "packem:resolve-file-url",
        resolveId: {
            // Only `file://` URLs are handled; a native filter lets the bundler skip
            // this hook for every other specifier (forwarded by cachePlugin).
            filter: {
                id: FILE_URL_RE,
            },
            handler(id) {
                if (id.startsWith("file://")) {
                    return fileURLToPath(id);
                }

                return undefined;
            },
        },
    };
};

export default resolveFileUrl;
