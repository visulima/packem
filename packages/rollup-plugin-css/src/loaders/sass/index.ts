/**
 * Modified copy of https://github.com/webpack-contrib/sass-loader
 *
 * MIT License
 *
 * Copyright JS Foundation and other contributors
 */
import { fileURLToPath } from "node:url";

import { isAbsolute } from "@visulima/path";
import type { RawSourceMap } from "source-map-js";

import type { Loader } from "../types";
import modernImporter from "./modern/importer";
import type { SassLoaderOptions } from "./types";
import getSassImplementation from "./utils/get-sass-compiler";
import getSassOptions from "./utils/get-sass-options";
import normalizeSourceMap from "./utils/normalize-source-map";
import errorFactory from "./utils/sass-error-factory";

const loader: Loader<SassLoaderOptions> = {
    name: "sass",

    async process({ code, map }) {
        const foundSassPackage = this.options.implementation;
        const compile = await getSassImplementation(foundSassPackage);

        const options = await getSassOptions(
            {
                environment: this.environment,
                resourcePath: this.id,
                rootContext: this.cwd as string,
            },
            this.logger,
            this.options,
            code,
            this.useSourcemap,
        );

        options.importers ??= [];
        options.importers.push(modernImporter(this.id, this.debug ?? false));

        let result;

        try {
            // The typing resolution is incorrect - @TODO: fix it if possible
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            result = compile(options as any);
        } catch (error) {
            const sassError = error as { span?: { url?: URL | string } };

            // There are situations when the `file`/`span.url` property do not exist
            // Modern API
            if (sassError.span?.url !== undefined) {
                this.deps.add(fileURLToPath(sassError.span.url));
            }

            throw errorFactory(error as Parameters<typeof errorFactory>[0], this.id);
        }

        let resultMap: RawSourceMap | undefined = result.sourceMap;

        // Modify source paths only for webpack, otherwise we do nothing
        if (resultMap && this.useSourcemap) {
            resultMap = normalizeSourceMap(resultMap);
        }

        result.loadedUrls
            .filter((loadedUrl) => loadedUrl.protocol === "file:")
            .forEach((includedFile) => {
                const normalizedIncludedFile = fileURLToPath(includedFile);

                // Custom `importer` can return only `contents` so includedFile will be relative
                if (isAbsolute(normalizedIncludedFile)) {
                    this.deps.add(normalizedIncludedFile);
                }
            });

        return {
            code: Buffer.from(result.css).toString(),
            map: resultMap ? JSON.stringify(resultMap) : map,
        };
    },
    test: /\.(sass|scss)$/i,
};

export default loader;
export type { SassLoaderContext, SassLoaderOptions } from "./types";
