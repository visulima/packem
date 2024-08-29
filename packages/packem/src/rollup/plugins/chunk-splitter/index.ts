import type { Plugin, PreserveEntrySignaturesOption } from "rollup";

import gatherExports from "./gather";

const chunkSplitter = ({ preserveChunkSignature = false }: { preserveChunkSignature?: PreserveEntrySignaturesOption | undefined } = {}): Plugin => {
    return {
        moduleParsed: {
            async handler(module_) {
                if (!module_.isEntry) {
                    return;
                }

                // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
                for await (const exported of gatherExports(this, module_)) {
                    if (exported.id === module_.id) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    this.emitFile({
                        id: exported.id,
                        name: exported.exportedName,
                        preserveSignature: preserveChunkSignature,
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
