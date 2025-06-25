import type { PreRenderedChunk } from "rollup";

import { CHUNKS_PACKEM_FOLDER, SHARED_PACKEM_FOLDER } from "../constants";

const getChunkFilename = (chunk: PreRenderedChunk, extension: string): string => {
    if (chunk.isDynamicEntry) {
        return `${CHUNKS_PACKEM_FOLDER}/[name].${extension}`;
    }

    return `${SHARED_PACKEM_FOLDER}/${chunk.name}-[hash].${extension}`;
};

export default getChunkFilename;
