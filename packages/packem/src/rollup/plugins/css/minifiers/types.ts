import type { PluginContext } from "rollup";

import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";

type MinifierContext = {
    /** Browser targets */
    readonly browserTargets: string[];
    /** [Function for emitting a warning](https://rollupjs.org/guide/en/#thiswarnwarning-string--rollupwarning-position-number---column-number-line-number---void) */
    readonly warn: PluginContext["warn"];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Minifier<Options = Record<string, any>> {
    handler: (this: MinifierContext, data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options) => Promise<ExtractedData>;
    name: string;
}
