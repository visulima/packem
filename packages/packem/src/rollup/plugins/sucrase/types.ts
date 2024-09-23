import type { FilterPattern } from "@rollup/pluginutils";
import type { Options } from "sucrase";

export interface SucrasePluginConfig extends Options {
    exclude?: FilterPattern;
    extensions?: string[];
    include?: FilterPattern;
}
