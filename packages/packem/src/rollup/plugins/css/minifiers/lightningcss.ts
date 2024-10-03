import { transform, TransformOptions } from "lightningcss";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";
import type { Minifier } from "./types";

const lightningcssMinifier: Minifier<TransformOptions> = {
    name: "lightningcss",
    handler: async (data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: TransformOptions): Promise<ExtractedData> => {
// transform()

        return data;
    }
}

export default lightningcssMinifier;
