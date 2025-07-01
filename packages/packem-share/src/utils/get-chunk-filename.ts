import type { PreRenderedChunk } from "rollup";

import { CHUNKS_PACKEM_FOLDER, SHARED_PACKEM_FOLDER } from "../constants";

/**
 * Generates the appropriate filename for a Rollup chunk based on its type.
 * @param chunk The pre-rendered chunk information from Rollup
 * @param extension The file extension to use for the chunk
 * @returns The generated filename pattern for the chunk
 */
const getChunkFilename = (chunk: PreRenderedChunk, extension: string): string => {
    if (chunk.isDynamicEntry) {
        return `${CHUNKS_PACKEM_FOLDER}/[name].${extension}`;
    }

    return `${SHARED_PACKEM_FOLDER}/${chunk.name}-[hash].${extension}`;
};

export default getChunkFilename;
