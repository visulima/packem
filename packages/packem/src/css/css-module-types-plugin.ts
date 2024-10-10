import { createFilter } from "@rollup/pluginutils";
import { writeFileSync } from "@visulima/fs";
import type { Pail } from "@visulima/pail";
import type { Plugin } from "rollup";

import Loaders from "../rollup/plugins/css/loaders/loader";
import type { LoaderContext } from "../rollup/plugins/css/loaders/types";
import type { StyleOptions } from "../rollup/plugins/css/types";
import { ensurePCSSOption, ensurePCSSPlugins, inferHandlerOption, inferOption } from "../rollup/plugins/css/utils/options";

// eslint-disable-next-line sonarjs/cognitive-complexity,import/no-unused-modules
export default async (options: StyleOptions, logger: Pail, cwd: string): Promise<Plugin> => {
    const isIncluded = createFilter(options.include, options.exclude);

    const loaderOptions = {
        dts: options.dts ?? false,
        extensions: options.extensions ?? [".css", ".pcss", ".postcss", ".sss"],
        namedExports: options.namedExports ?? false,
        postcss: {
            ...options.postcss,
            autoModules: options.autoModules ?? false,
            config: inferOption(options.postcss?.config, {}),
            import: inferHandlerOption(options.postcss?.import, options.alias),
            modules: inferOption(options.postcss?.modules, false),
            to: options.postcss?.to,
            url: inferHandlerOption(options.postcss?.url, options.alias),
        },
    };

    if (options.postcss?.parser) {
        loaderOptions.postcss.parser = await ensurePCSSOption(options.postcss.parser, "parser", cwd);
    }

    if (options.postcss?.syntax) {
        loaderOptions.postcss.syntax = await ensurePCSSOption(options.postcss.syntax, "syntax", cwd);
    }

    if (options.postcss?.stringifier) {
        loaderOptions.postcss.stringifier = await ensurePCSSOption(options.postcss.stringifier, "stringifier", cwd);
    }

    if (options.postcss?.plugins) {
        loaderOptions.postcss.plugins = await ensurePCSSPlugins(options.postcss.plugins, cwd);
    }

    const postCssLoader = options.loaders?.find((loader) => loader.name === "postcss");

    const loaders = new Loaders({
        extensions: loaderOptions.extensions,
        loaders: postCssLoader ? [postCssLoader] : [],
        logger,
        options: {
            ...options,
            ...loaderOptions,
            emit: false,
            extract: false,
            inject: false,
        },
    });

    let dtsCode:
        | undefined
        | {
              code: string;
              id: string;
          };

    return <Plugin>{
        name: "packem:css-module-types",

        async transform(code, transformId) {
            if (!isIncluded(transformId) || !loaders.isSupported(transformId)) {
                return null;
            }

            // Skip empty files
            if (code.replaceAll(/\s/g, "") === "") {
                return null;
            }

            if (typeof options.onImport === "function") {
                options.onImport(code, transformId);
            }

            const context: LoaderContext = {
                assets: new Map<string, Uint8Array>(),
                deps: new Set(),
                dts: loaderOptions.dts,
                emit: false,
                extensions: loaderOptions.extensions,
                extract: false,
                id: transformId,
                inject: false,
                logger,
                namedExports: loaderOptions.namedExports,
                options: {},
                plugin: this,
                sourceMap: false,
                warn: this.warn.bind(this),
            };

            const result = await loaders.process({ code }, context);

            if (result.dts) {
                dtsCode = {
                    code: result.dts,
                    id: transformId,
                };

                this.emitFile({
                    name: transformId + ".d.ts",
                    source: Buffer.from(dtsCode.code),
                    type: "asset",
                });
                this.addWatchFile(transformId + ".d.ts");
            }

            return null;
        },
        writeBundle: {
            handler() {
                if (dtsCode) {
                    logger.info({
                        message: "Generated declaration file for " + dtsCode.id.replace((cwd as string) + "/", ""),
                        prefix: "dts:css",
                    });

                    // TODO: Find a better way to display the file on rollup
                    // This is a hack to write the declaration file to the source directory
                    writeFileSync(dtsCode.id + ".d.ts", dtsCode.code);

                    this.setAssetSource(dtsCode.id + ".d.ts", dtsCode.code);
                }
            },
            order: "pre",
        },
    };
};
