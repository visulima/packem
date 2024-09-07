/**
 * Modified copy of https://github.com/cprecioso/rollup-plugin-chunk-per-export/blob/main/src/index.ts
 */
import type { ModuleInfo, Plugin } from "rollup";

import gatherExports from "./gather";

const chunkSplitter = (): Plugin => {
    return {
        moduleParsed: {
            async handler(info: ModuleInfo) {
                if (!info.isEntry) {
                    return;
                }

                // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
                for await (const exported of gatherExports(this, info)) {
                    if (exported.id === info.id) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    this.emitFile({
                        id: exported.id,
                        name: exported.exportedName,
                        preserveSignature: "exports-only",
                        type: "chunk",
                    });
                }
            },
            order: "post",
        },
        name: "packem:chunk-splitter",
    };
};

export default chunkSplitter;
