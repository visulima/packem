import type { FilterPattern } from "@rollup/pluginutils";
import type { Options } from "@swc/types";

export type SwcPluginConfig = {
    exclude?: FilterPattern;
    include?: FilterPattern;
} & Exclude<Options, "configFile" | "exclude" | "filename" | "sourceMaps" | "swcrc">;
