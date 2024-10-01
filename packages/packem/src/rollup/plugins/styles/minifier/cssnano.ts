import type { Options } from "cssnano";
import cssnano from "cssnano";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minfier } from "./types";

const cssnanoMinifier: Minfier = async (data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options): Promise<ExtractedData> => {
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

    return {
        ...data,
        css: resultMinified.css,
        map: resultMinified.map.toString(),
    };
};

export default cssnanoMinifier;
