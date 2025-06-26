import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import type { Plugin } from "rollup";

export interface RawLoaderOptions {
    exclude?: FilterPattern;
    include?: FilterPattern;
}

export const rawPlugin = (options: RawLoaderOptions): Plugin => {
    const filter = createFilter(options.include, options.exclude);

    return <Plugin>{
        async load(id) {
            if (id.includes("?raw")) {
                return await this.load({
                    id: id.replace(/\?raw$/, ""),
                });
            }

            return undefined;
        },
        name: "packem:raw",
        transform(code, id) {
            if (!filter(id) && !id.includes("?raw")) {
                return undefined;
            }

            if (!id.includes("?raw")) {
                // eslint-disable-next-line no-param-reassign
                code = `export default ${JSON.stringify(code)}`;
            }

            return {
                code,
                map: { mappings: "" },
            };
        },
    };
};
