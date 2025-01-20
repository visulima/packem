import type { FilterPattern } from "@rollup/pluginutils";
import type { JsxOptions, TransformOptions, TypeScriptOptions } from "oxc-transform";

export type InternalOXCTransformPluginConfig = {
    exclude?: FilterPattern;
    extensions?: string[];
    include?: FilterPattern;
} & TransformOptions;

export type OXCTransformPluginConfig = {
    exclude?: FilterPattern;
    extensions?: string[];
    include?: FilterPattern;
    /** Configure how TSX and JSX are transformed. */
    jsx?: "preserve" | Omit<JsxOptions, "refresh">;
    /** Configure how TypeScript is transformed. */
    typescript?: Omit<TypeScriptOptions, "declaration" | "rewriteImportExtensions">;
} & Omit<TransformOptions, "cwd" | "sourcemap" | "target" | "typescript">;
