import type { FilterPattern } from "@rollup/pluginutils";
import type { JsxOptions, TransformOptions } from "oxc-transform";

export type InternalOXCTransformPluginConfig = {
    exclude?: FilterPattern;
    include?: FilterPattern;
} & TransformOptions;

export type OXCTransformPluginConfig = {
    exclude?: FilterPattern;
    include?: FilterPattern;
    /** Configure how TSX and JSX are transformed. */
    jsx?: "preserve" | Omit<JsxOptions, "refresh">;
} & Omit<TransformOptions, "cwd" | "sourcemap" | "target" | "typescript">;
