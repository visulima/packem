import path from "node:path";

import { normalizePath } from "../../utils/path";
import type { Loader } from "../types";
import importer from "./importer";

const loader: Loader<LESSLoaderOptions> = {
    name: "less",
    async process({ code, map }) {
        const options = { ...this.options };
        const less = await import("less").then((m) => m.default);

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!less) {
            throw new Error("You need to install `less` package in order to process Less files");
        }

        const plugins = [importer];

        if (options.plugins) {
            plugins.push(...options.plugins);
        }

        const result: Less.RenderOutput = (await less.render(code, {
            ...options,
            filename: this.id,
            plugins,
            sourceMap: { outputSourceFiles: true, sourceMapBasepath: path.dirname(this.id) },
        })) as Less.RenderOutput;

        const deps = result.imports;

        for (const dep of deps) {
            this.deps.add(normalizePath(dep));
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return { code: result.css, map: result.map ?? map };
    },
    test: /\.less$/i,
};

export interface LESSLoaderOptions extends Record<string, unknown>, Less.Options {}

export default loader;
