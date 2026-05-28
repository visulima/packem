import type { ExistingRawSourceMap, RollupOutput } from "rollup";

/** Find and parse a source map from the output chunks. */
const findSourceMapChunk = (chunks: RollupOutput["output"], fileName: string): ExistingRawSourceMap => {
    const target = chunks.find((entry) => entry.fileName === fileName);

    if (!target) {
        throw new Error(`Unable to find file ${fileName} from the following chunks: ${chunks.map((entry) => entry.fileName).join(", ")}`);
    }

    if (target.type !== "asset") {
        throw new Error("Sourcemap chunk is not an asset");
    }

    if (typeof target.source !== "string") {
        throw new TypeError("Sourcemap chunk source is not a string");
    }

    const map = JSON.parse(target.source) as ExistingRawSourceMap;

    return map;
};

export default findSourceMapChunk;
