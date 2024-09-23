import type { FilterPattern } from "@rollup/pluginutils";
import type { Options } from "@swc/types";

export type SwcPluginConfig = {
    exclude?: FilterPattern;
    extensions?: string[];
    include?: FilterPattern;
} & Exclude<Options, "configFile" | "exclude" | "filename" | "sourceMaps" | "swcrc">;
