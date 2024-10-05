import { existsSync } from "node:fs";

import { readFileSync } from "@visulima/fs";
import { dirname, join, normalize } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";
import type { RenderOptions } from "stylus";
import stylus from "stylus";

import { mm } from "../utils/sourcemap";
import type { Loader } from "./types";

const loader: Loader<StylusLoaderOptions> = {
    name: "stylus",
    async process({ code, map }) {
        const options = { ...this.options };
        const basePath = normalize(dirname(this.id));
        const paths = [`${basePath}/node_modules`, basePath];

        if (options.paths) {
            paths.push(...options.paths);
        }

        const style = stylus(code, options).set("filename", this.id).set("paths", paths).set("sourcemap", { basePath, comment: false }) as unknown as {
            deps: (filename?: string) => string[];
            filename: string;
            render: (callback: (error: Error | null, css: string) => void) => void;
            sourcemap: RawSourceMap;
        };

        const render = async (): Promise<string> =>
            await new Promise((resolve, reject) => {
                style.render((error, css) => (error ? reject(error) : resolve(css)));
            });

        // eslint-disable-next-line no-param-reassign
        code = await render();

        const deps = style.deps();

        for (const dep of deps) {
            this.deps.add(normalize(dep));
        }

        // We have to manually modify the `sourcesContent` field
        // since stylus compiler doesn't support it yet
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (style.sourcemap?.sources && !style.sourcemap.sourcesContent) {
            style.sourcemap.sourcesContent = await Promise.all(
                style.sourcemap.sources.map(async (source) => {
                    const file = normalize(join(basePath, source));

                    // eslint-disable-next-line security/detect-non-literal-fs-filename
                    if (!existsSync(file)) {
                        return null as unknown as string;
                    }

                    return readFileSync(file);
                }),
            );
        }

        return { code, map: mm(style.sourcemap as unknown as RawSourceMap).toString() ?? map };
    },
    test: /\.(styl|stylus)$/i,
};

export interface StylusLoaderOptions extends Record<string, unknown>, RenderOptions {}

// eslint-disable-next-line import/no-unused-modules
export default loader;
