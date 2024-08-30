import type { PreRenderedChunk } from "rollup";

const getChunkFilename = (chunk: PreRenderedChunk, extension: string): string => {
    if (chunk.isDynamicEntry) {
        return `chunks/[name].${extension}`;
    }

    return `shared/[name]-[hash].${extension}`;
};

export default getChunkFilename;
