/**
 * Modified copy of https://github.com/egoist/rollup-plugin-esbuild/blob/dev/src/index.ts
 *
 * MIT License
 *
 * Copyright (c) 2020 EGOIST
 */
import { createFilter } from "@rollup/pluginutils";
import { extname } from "@visulima/path";
import type { Loader } from "esbuild";
import { transform } from "esbuild";
import type { Plugin as RollupPlugin } from "rollup";

import { DEFAULT_LOADERS } from "../../../constants";
import type { TransformerFn as TransformerFunction } from "../../../types";
import resolvedIdCache from "../../utils/resolved-id-cache";
import getRenderChunk from "./get-render-chunk";
import doOptimizeDeps from "./optmize-deps";
import type { EsbuildPluginConfig, OptimizeDepsResult } from "./types";
import warn from "./warn";

const esbuildTransformer = ({
    exclude,
    include,
    loaders: _loaders,
    logger,
    optimizeDeps,
    sourceMap,
    ...esbuildOptions
// eslint-disable-next-line sonarjs/cognitive-complexity
}: EsbuildPluginConfig): RollupPlugin => {
    const loaders = DEFAULT_LOADERS;

    if (_loaders !== undefined) {
        // eslint-disable-next-line prefer-const
        for (let [key, value] of Object.entries(_loaders)) {
            key = key.startsWith(".") ? key : `.${key}`;

            if (typeof value === "string") {
                // eslint-disable-next-line security/detect-object-injection
                loaders[key] = value;
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            } else if (!value) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete,security/detect-object-injection
                delete loaders[key];
            }
        }
    }

    const extensions: string[] = Object.keys(loaders);
    // eslint-disable-next-line @rushstack/security/no-unsafe-regexp,security/detect-non-literal-regexp
    const INCLUDE_REGEXP = new RegExp(`\\.(${extensions.map((extension) => extension.slice(1)).join("|")})$`);

    const filter = createFilter(include ?? INCLUDE_REGEXP, exclude);

    let optimizeDepsResult: OptimizeDepsResult | undefined;
    let cwd = process.cwd();

    // Initialize own resolution cache.
    const resolveIdCache = new Map<string, string | null>();

    return {
        async buildStart() {
            if (!optimizeDeps || optimizeDepsResult) {
                return;
            }

            optimizeDepsResult = await doOptimizeDeps({
                cwd,
                sourceMap: sourceMap ?? false,
                ...optimizeDeps,
            });

            logger.debug("optimized %O", optimizeDepsResult.optimized);
        },

        name: "packem:esbuild",

        options({ context }) {
            if (context) {
                cwd = context;
            }

            return null;
        },

        renderChunk: getRenderChunk({
            ...esbuildOptions,
            sourceMap,
        }),

        async resolveId(id, importer, { isEntry }): Promise<string | null> {
            if (optimizeDepsResult?.optimized.has(id)) {
                const m = optimizeDepsResult.optimized.get(id);

                if (m) {
                    logger.debug("resolved %s to %s", id, m.file);

                    return m.file;
                }
            }

            return await resolvedIdCache(resolveIdCache, { filter, id, importer, isEntry }, extensions);
        },

        async transform(code, id) {
            if (!filter(id) || optimizeDepsResult?.optimized.has(id)) {
                return null;
            }

            const extension = extname(id);
            // eslint-disable-next-line security/detect-object-injection
            const loader = loaders[extension];

            logger.debug("transforming %s with %s loader", id, loader);

            if (!loader) {
                return null;
            }

            const result = await transform(code, {
                format: (["base64", "binary", "dataurl", "text", "json"] satisfies Loader[] as Loader[]).includes(loader) ? "esm" : undefined,
                loader,
                // @see https://github.com/evanw/esbuild/issues/1932#issuecomment-1013380565
                sourcefile: id.replace(/\.[cm]ts/, ".ts"),
                sourcemap: sourceMap,
                ...esbuildOptions,
            });

            await warn(this, result.warnings);

            if (result.code) {
                return {
                    code: result.code,
                    map: result.map || null,
                };
            }

            return null;
        },
    };
};

esbuildTransformer.NAME = "esbuild";

export default esbuildTransformer as TransformerFunction;
