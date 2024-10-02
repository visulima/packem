import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";

export type Minifier = (data: ExtractedData, sourceMap: LoaderContext["sourceMap"]) => Promise<ExtractedData>;
