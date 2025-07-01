import type { RawSourceMap } from "source-map-js";

const normalizeSourceMap = (map: RawSourceMap): RawSourceMap => {
    const newMap = map;

    // result.map.file is an optional property that provides the output filename.
    // Since we don't know the final filename in the webpack build chain yet, it makes no sense to have it.
    if (newMap.file !== undefined) {
        delete newMap.file;
    }

    newMap.sourceRoot = "";

    return newMap;
};

export default normalizeSourceMap;
