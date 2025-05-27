import type { FilterPattern } from "@rollup/pluginutils";
import type { Options } from "@swc/types";

export type SwcPluginConfig = Exclude<Options, "configFile" | "exclude" | "filename" | "sourceMaps" | "swcrc"> & {
    exclude?: FilterPattern;
    include?: FilterPattern;
};
