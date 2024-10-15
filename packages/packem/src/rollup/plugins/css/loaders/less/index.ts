import { dirname, normalize } from "@visulima/path";
import less from "less";

import type { Loader } from "../types";
import importer from "./importer";

const loader: Loader<LESSLoaderOptions> = {
    name: "less",
    async process({ code, map }) {
        const plugins: Less.Plugin[] = [importer(this.alias as Record<string, string>)];

        if (this.options.plugins) {
            plugins.push(...this.options.plugins);
        }

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const render = less.render as (input: string, options: Less.Options) => Promise<Less.RenderOutput>;

        const result: Less.RenderOutput = await render(code, {
            ...this.options,
            filename: this.id,
            plugins,
            sourceMap: { outputSourceFiles: true, sourceMapBasepath: dirname(this.id) },
        });

        const deps = result.imports;

        for (const dep of deps) {
            this.deps.add(normalize(dep));
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return { code: result.css, map: result.map ?? map };
    },
    test: /\.less$/i,
};

export interface LESSLoaderOptions extends Record<string, unknown>, Less.Options {}

// eslint-disable-next-line import/no-unused-modules
export default loader;
