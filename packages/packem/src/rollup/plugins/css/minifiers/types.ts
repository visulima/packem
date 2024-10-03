import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Minifier<Options = Record<string, any>> = {
    handler: (data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: Options) => Promise<ExtractedData>;
    name: string;
};
