import type { RollupJsonOptions } from "@rollup/plugin-json";
import rollupJSONPlugin from "@rollup/plugin-json";
import type { Plugin, TransformResult } from "rollup";

const EXPORT_DEFAULT = "export default ";
const JSON_FILE_RE = /\.json$/;

export type { RollupJsonOptions } from "@rollup/plugin-json";

export const JsonPlugin = (options: RollupJsonOptions): Plugin => {
    const plugin = rollupJSONPlugin(options);

    return <Plugin>{
        ...plugin,
        name: "packem:json",
        transform: {
            filter: {
                id: JSON_FILE_RE,
            },
            handler(code, id) {
                const transformHandler = plugin.transform as ((this: unknown, code: string, id: string) => TransformResult) | undefined;
                const result = transformHandler?.call(this, code, id) as { code?: string } | string | null | undefined;

                if (result && typeof result !== "string" && "code" in result && result.code?.startsWith(EXPORT_DEFAULT)) {
                    result.code = result.code.replace(EXPORT_DEFAULT, "module.exports = ");
                }

                return result;
            },
        },
    };
};
