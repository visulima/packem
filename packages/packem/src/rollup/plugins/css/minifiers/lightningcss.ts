import type { TransformOptions } from "lightningcss";
import { transform } from "lightningcss";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minifier } from "./types";

const lightningcssMinifier: Minifier<TransformOptions> = {
    handler: async (data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: TransformOptions): Promise<ExtractedData> => 
        // transform()

         data
    ,
    name: "lightningcss",
};

export default lightningcssMinifier;
