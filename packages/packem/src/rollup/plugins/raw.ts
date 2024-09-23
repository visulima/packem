import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "rollup";

export interface RawLoaderOptions {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const rawPlugin = (options: RawLoaderOptions): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    return {
        name: "packem:raw",
        transform(code, id) {
            if (!filter(id)) {
                return null;
            }

            return {
                code: `export default ${JSON.stringify(code)}`,
                map: null,
            };
        },
    };
};
