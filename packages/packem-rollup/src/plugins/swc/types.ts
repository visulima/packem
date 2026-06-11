import type { FilterPattern } from "@rollup/pluginutils";
import type { Options } from "@swc/types";

// `configFile`, `filename` and `swcrc` are set by the plugin itself, so they are
// omitted from the public config. `sourceMaps` is intentionally kept: the bundler
// passes it through to control whether swc emits a source map.
export type SwcPluginConfig = Omit<Options, "configFile" | "exclude" | "filename" | "swcrc"> & {
    exclude?: FilterPattern;
    include?: FilterPattern;
};
