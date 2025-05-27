import type { FilterPattern } from "@rollup/pluginutils";
import type { JsxOptions, TransformOptions } from "oxc-transform";

export type InternalOXCTransformPluginConfig = TransformOptions & {
    exclude?: FilterPattern;
    include?: FilterPattern;
};

export type OXCTransformPluginConfig = Omit<TransformOptions, "cwd" | "sourcemap" | "target" | "typescript"> & {
    exclude?: FilterPattern;
    include?: FilterPattern;

    /** Configure how TSX and JSX are transformed. */
    jsx?: Omit<JsxOptions, "refresh"> | "preserve";
};
