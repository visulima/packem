/**
 * Modified copy of https://github.com/egoist/rollup-plugin-esbuild/blob/dev/src/optimizer/optmize-deps.ts
 *
 * MIT License
 *
 * Copyright (c) 2020 EGOIST
 */
import { findCacheDirSync } from "@visulima/find-cache-dir";
import { readFileSync } from "@visulima/fs";
import { join } from "@visulima/path";
import type { OnResolveArgs, OnResolveResult } from "esbuild";
import { build as esbuildBuild } from "esbuild";
// eslint-disable-next-line import/no-namespace
import * as rsModuleLexer from "rs-module-lexer";

import type { Optimized, OptimizeDepsOptions, OptimizeDepsResult } from "../types";

const slash = (p: string) => p.replaceAll("\\", "/");

const { parseAsync } = rsModuleLexer;

const optimizeDeps = async (options: OptimizeDepsOptions): Promise<OptimizeDepsResult> => {
    // eslint-disable-next-line unicorn/prevent-abbreviations
    const cacheDir = findCacheDirSync("@visulima/packem/optimize-deps", {
        create: true,
        cwd: options.cwd,
    });

    if (!cacheDir) {
        throw new Error('[packem:optimize-deps]: failed to find or create cache directory "node_modules/.cache/packem/optimize_deps".');
    }

    await esbuildBuild({
        absWorkingDir: options.cwd,
        bundle: true,
        entryPoints: options.include,
        format: "esm",
        ignoreAnnotations: true,
        metafile: true,
        outdir: cacheDir,
        sourcemap: options.sourceMap,
        splitting: true,
        ...options.esbuildOptions,
        plugins: [
            {
                name: "optimize-deps",
                async setup(build) {
                    build.onResolve({ filter: /.*/ }, async (arguments_: OnResolveArgs): Promise<OnResolveResult | null | undefined> => {
                        if (options.exclude?.includes(arguments_.path)) {
                            return {
                                external: true,
                            };
                        }

                        // eslint-disable-next-line no-underscore-dangle
                        if (arguments_.pluginData?.__resolving_dep_path__) {
                            return undefined; // use default resolve algorithm
                        }

                        if (options.include.includes(arguments_.path)) {
                            const resolved = await build.resolve(arguments_.path, {
                                kind: "import-statement",
                                pluginData: { __resolving_dep_path__: true },
                                resolveDir: arguments_.resolveDir,
                            });

                            if (resolved.errors.length > 0 || resolved.warnings.length > 0) {
                                return resolved;
                            }

                            return {
                                namespace: "optimize-deps",
                                path: arguments_.path,
                                pluginData: {
                                    absolute: resolved.path,
                                    resolveDir: arguments_.resolveDir,
                                },
                            };
                        }

                        return undefined;
                    });

                    build.onLoad({ filter: /.*/, namespace: "optimize-deps" }, async (arguments_) => {
                        const { absolute, resolveDir } = arguments_.pluginData;
                        const sourceCode = readFileSync(absolute) as unknown as string;
                        const { output } = await parseAsync({ input: [{ code: sourceCode, filename: absolute }] });
                        const exported = output[0]?.exports ?? [];

                        return {
                            contents: exported.length > 0 ? `export * from '${slash(absolute)}'` : `module.exports = require('${slash(absolute)}')`,
                            resolveDir,
                        };
                    });
                },
            },
            ...(options.esbuildOptions?.plugins ?? []),
        ],
    });

    const optimized: Optimized = new Map<string, { file: string }>();

    for (const id of options.include) {
        optimized.set(id, { file: join(cacheDir, `${id}.js`) });
    }

    return {
        cacheDir,
        optimized,
    };
};

export default optimizeDeps;
