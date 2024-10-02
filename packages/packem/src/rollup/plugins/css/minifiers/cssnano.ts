import type { Options } from "cssnano";
import cssnano from "cssnano";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minifier } from "./types";

const cssnanoMinifier = (options: Options = {}): Minifier => async (data: ExtractedData, sourceMap: LoaderContext["sourceMap"]): Promise<ExtractedData> => {
    const minifier = cssnano(options);

    const resultMinified = await minifier.process(data.css, {
        from: data.name,
        map: sourceMap && {
            annotation: false,
            inline: false,
            prev: data.map,
            sourcesContent: sourceMap.content,
        },
        to: data.name,
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (resultMinified.map) {
        // eslint-disable-next-line no-param-reassign
        data.map = resultMinified.map.toString();
    }

    return {
        ...data,
        css: resultMinified.css,
    };
};

export default cssnanoMinifier;
