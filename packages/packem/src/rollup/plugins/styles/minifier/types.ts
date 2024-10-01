import type { LoaderContext } from "../loaders/types";
import type { ExtractedData } from "../types";

export type Minfier = (data: ExtractedData, sourceMap: LoaderContext["sourceMap"], options: object) => Promise<ExtractedData>;
