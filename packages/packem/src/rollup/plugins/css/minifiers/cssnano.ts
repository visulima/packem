import type { Options } from "cssnano";
import cssnano from "cssnano";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minifier } from "./types";

const cssnanoMinifier: Minifier<Options> = {
    async handler(data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options): Promise<ExtractedData> {
        const minifier = cssnano(options);

        try {
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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                map: resultMinified.map ? resultMinified.map.toString() : undefined,
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
             
            throw new Error(`CSS minification failed for ${data.name}: ${error.message}`, {
                cause: error,
            });
        }
    },
    name: "cssnano",
};

// eslint-disable-next-line import/no-unused-modules
export default cssnanoMinifier;
