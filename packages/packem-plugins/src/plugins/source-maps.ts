import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { readFile } from "@visulima/fs";
import { loadSourceMap } from "@visulima/source-map";
import type { ExistingRawSourceMap, Plugin, PluginContext } from "rollup";

const QUERY_SUFFIX_RE = /\?[^?]*$/;

export interface SourcemapsPluginOptions {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const sourcemapsPlugin = ({ exclude, include }: SourcemapsPluginOptions = {}): Plugin => {
    // Create a filter function based on the include and exclude options
    const filter = createFilter(include, exclude);

    return {
        async load(this: PluginContext, id: string) {
            if (!filter(id)) {
                return undefined;
            }

            let code: string;

            try {
                code = await readFile(id, { buffer: false });

                this.addWatchFile(id);
            } catch (error: unknown) {
                try {
                    // If reading fails, try again without a query suffix that some plugins use
                    const cleanId = id.replace(QUERY_SUFFIX_RE, "");

                    code = await readFile(cleanId, { buffer: false });

                    this.addWatchFile(cleanId);
                } catch {
                    this.warn(`Failed reading file "${id}": ${error instanceof Error ? error.message : String(error)}`);

                    return undefined;
                }
            }

            // The second disk read in `loadSourceMap(id)` is only worthwhile when the
            // file actually carries a sourceMappingURL comment. Skip it for the common
            // case of modules with no inline/linked map.
            if (!code.includes("sourceMappingURL")) {
                return code;
            }

            let map: ExistingRawSourceMap;

            try {
                // Try to resolve the source map for the code
                const result = loadSourceMap(id);

                // If the code contained no sourceMappingURL, return the code
                if (result === undefined) {
                    return code;
                }

                map = result as unknown as ExistingRawSourceMap;
            } catch (error: unknown) {
                this.warn(`Failed resolving source map for "${id}": ${error instanceof Error ? error.message : String(error)}`);

                return { code };
            }

            // Return the code and the map
            return { code, map };
        },
        name: "packem:sourcemaps",
    };
};
