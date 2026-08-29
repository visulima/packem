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
                // `@rollup/plugin-json`'s `transform` may be the bare function form
                // or the object form (`{ handler, ... }`); normalize to the callable.
                const transform = plugin.transform as
                    | ((this: unknown, code: string, id: string) => TransformResult)
                    | { handler: (this: unknown, code: string, id: string) => TransformResult }
                    | undefined;
                const transformHandler = typeof transform === "function" ? transform : transform?.handler;
                const result = transformHandler?.call(this, code, id) as string | { code?: string } | null | undefined;

                // `@rollup/plugin-json` emits `export default <json>` for ESM. This
                // adapter targets CJS interop, so rewrite that leading ESM default
                // export to a `module.exports = <json>` assignment instead.
                if (result && typeof result !== "string" && "code" in result && result.code?.startsWith(EXPORT_DEFAULT)) {
                    result.code = result.code.replace(EXPORT_DEFAULT, "module.exports = ");
                }

                return result;
            },
        },
    };
};
