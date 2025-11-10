import { fileURLToPath } from "node:url";

import type { Plugin } from "rollup";

const resolveFileUrl = (): Plugin => {
    return {
        name: "packem:resolve-file-url",
        resolveId: {
            filter: {
                id: /^file:\/\//,
            },
            handler(id) {
                try {
                    return fileURLToPath(id);
                } catch {
                    // Invalid URL, let other plugins handle it
                    return undefined;
                }
            },
        },
    };
};

export default resolveFileUrl;
