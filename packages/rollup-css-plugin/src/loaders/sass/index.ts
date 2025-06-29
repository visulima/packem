/**
 * Modified copy of https://github.com/webpack-contrib/sass-loader
 *
 * MIT License
 *
 * Copyright JS Foundation and other contributors
 */
import { fileURLToPath } from "node:url";

import { isAbsolute } from "@visulima/path";
import type { CompileResult } from "sass";
import type { RawSourceMap } from "source-map-js";

import type { Loader } from "../types";
import modernImporter from "./modern/importer";
import type { SassApiType, SassLoaderOptions } from "./types";
import getCompileFunction from "./utils/get-compile-function";
import { getDefaultSassImplementation, getSassImplementation } from "./utils/get-sass-implementation";
import getSassOptions from "./utils/get-sass-options";
import normalizeSourceMap from "./utils/normalize-source-map";
import errorFactory from "./utils/sass-error-factory";

const loader: Loader<SassLoaderOptions> = {
    name: "sass",
    // eslint-disable-next-line sonarjs/cognitive-complexity
    async process({ code, map }) {
        let apiType: SassApiType = "modern-compiler";

        const foundSassPackage = this.options.implementation ?? getDefaultSassImplementation();

        if (foundSassPackage === "sass") {
            apiType = "modern";
        }

        const implementation = getSassImplementation(foundSassPackage);

        const options = await getSassOptions(
            {
                environment: this.environment,
                resourcePath: this.id,
                rootContext: this.cwd as string,
            },
            this.logger,
            this.warn,
            this.options,
            code,
            this.useSourcemap,
        );

        options.importers.push(modernImporter(this.id, this.debug ?? false));

        const compile = await getCompileFunction(implementation, apiType);

        let result;

        try {
            // The typing resolution is incorrect - @TODO: fix it if possible
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            result = (await compile(options as any)) as CompileResult;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // There are situations when the `file`/`span.url` property do not exist
            // Modern API
            if (error.span && error.span.url !== undefined) {
                this.deps.add(fileURLToPath(error.span.url));
            }

            throw errorFactory(error, this.id);
        }

        let resultMap: RawSourceMap | undefined = (result as CompileResult).sourceMap;

        // Modify source paths only for webpack, otherwise we do nothing
        if (resultMap && this.useSourcemap) {
            resultMap = normalizeSourceMap(resultMap);
        }

        if ((result as CompileResult).loadedUrls) {
            (result as CompileResult).loadedUrls.filter((loadedUrl) => loadedUrl.protocol === "file:").forEach((includedFile) => {
                const normalizedIncludedFile = fileURLToPath(includedFile);

                // Custom `importer` can return only `contents` so includedFile will be relative
                if (isAbsolute(normalizedIncludedFile)) {
                    this.deps.add(normalizedIncludedFile);
                }
            });
        }

        return {
            code: Buffer.from(result.css).toString(),
            map: resultMap ? JSON.stringify(resultMap) : map,
        };
    },
    test: /\.(sass|scss)$/i,
};

export default loader;
export type { SassApiType, SassLoaderContext, SassLoaderOptions } from "./types";
