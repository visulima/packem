import { dirname, normalize } from "@visulima/path";
import less from "less";

import type { Loader } from "../types";
import importer from "./importer";
import type { LESSLoaderOptions } from "./types";

const loader: Loader<LESSLoaderOptions> = {
    name: "less",
    async process({ code, map }) {
        const plugins: Less.Plugin[] = [importer(this.alias as Record<string, string>)];

        if (this.options.plugins) {
            plugins.push(...this.options.plugins);
        }

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

        return { code: result.css, map: result.map ?? map };
    },
    test: /\.less$/i,
};

export default loader;
