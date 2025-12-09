/**
 * Modified copy of https://github.com/egoist/rollup-plugin-esbuild/blob/dev/src/index.ts
 *
 * MIT License
 *
 * Copyright (c) 2020 EGOIST
 */
import { createFilter } from "@rollup/pluginutils";
import { DEFAULT_LOADERS } from "@visulima/packem-share/constants";
import { extname } from "@visulima/path";
import type { Loader } from "esbuild";
import { transform } from "esbuild";
import type { Plugin as RollupPlugin } from "rollup";

import type { TransformerFn as TransformerFunction } from "../../types";
import type { EsbuildPluginConfig, OptimizeDepsResult } from "./types";
import getRenderChunk from "./utils/get-render-chunk";
import doOptimizeDeps from "./utils/optimize-deps";
import warn from "./utils/warn";

const esbuildTransformer = ({ exclude, include, loaders: _loaders, logger, optimizeDeps, sourceMap, ...esbuildOptions }: EsbuildPluginConfig): RollupPlugin => {
    const loaders = DEFAULT_LOADERS;

    if (_loaders !== undefined) {
        // eslint-disable-next-line prefer-const
        for (let [key, value] of Object.entries(_loaders)) {
            const newKey = key.startsWith(".") ? key : `.${key}`;

            if (typeof value === "string") {
                loaders[newKey] = value;
            } else if (!value) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete loaders[newKey];
            }
        }
    }

    const extensions: string[] = Object.keys(loaders);

    const INCLUDE_REGEXP = new RegExp(String.raw`\.(${extensions.map((extension) => extension.slice(1)).join("|")})$`);

    const filter = createFilter(include ?? INCLUDE_REGEXP, exclude);

    let optimizeDepsResult: OptimizeDepsResult | undefined;
    let cwd = process.cwd();

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

            return undefined;
        },

        renderChunk: getRenderChunk({
            ...esbuildOptions,
            sourceMap,
        }),

        async resolveId(id): Promise<string | undefined> {
            if (optimizeDepsResult?.optimized.has(id)) {
                const m = optimizeDepsResult.optimized.get(id);

                if (m) {
                    logger.debug("resolved %s to %s", id, m.file);

                    return m.file;
                }
            }

            return undefined;
        },

        async transform(code, id) {
            if (!filter(id) || optimizeDepsResult?.optimized.has(id)) {
                return undefined;
            }

            const extension = extname(id);

            const loader = loaders[extension];

            logger.debug("transforming %s with %s loader", id, loader);

            if (!loader) {
                return undefined;
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
                    map: result.map || undefined,
                };
            }

            return undefined;
        },
    };
};

esbuildTransformer.NAME = "esbuild";

export default esbuildTransformer as TransformerFunction;
