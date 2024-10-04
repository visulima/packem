/**
 * Modified copy of https://github.com/webpack-contrib/sass-loader
 *
 * MIT License
 *
 * Copyright JS Foundation and other contributors
 */
import { fileURLToPath } from "node:url";

import { isAbsolute, normalize } from "@visulima/path";
import type { Importer as NodeSassImporter, Options as NodeSassOptions, Result as NodeSassResult } from "node-sass";
import type { CompileResult, StringOptions } from "sass";
import type { RawSourceMap } from "source-map-js";

import type { Environment } from "../../../../../types";
import type { Loader } from "../types";
import legacyImporter from "./legacy/importer";
import modernImporter from "./modern/importer";
import type { SassApiType } from "./types";
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

        const foundSassPackage = getDefaultSassImplementation();

        if (foundSassPackage === "sass") {
            apiType = "modern";
        } else if (foundSassPackage === "node-sass") {
            apiType = "legacy";
        }

        const isModernAPI = apiType === "modern" || apiType === "modern-compiler";
        const implementation = getSassImplementation(foundSassPackage);

        const options = await getSassOptions(
            {
                environment: this.environment,
                resourcePath: this.id,
                rootContext: this.cwd as string,
            },
            this.logger,
            this.warn,
            { ...this.options },
            code,
            this.useSourcemap,
            apiType,
        );

        if (isModernAPI) {
            options.importers.push(modernImporter(this.id));
        } else {
            if ((options as NodeSassOptions).importer && !Array.isArray((options as NodeSassOptions).importer)) {
                (options as NodeSassOptions).importer = [(options as NodeSassOptions).importer as NodeSassImporter];
            }

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            (options as NodeSassOptions).importer = [...(((options as NodeSassOptions).importer as NodeSassImporter[]) ?? []), legacyImporter];
        }

        const compile = getCompileFunction(implementation, apiType);

        let result;

        try {
            result = (await compile(options)) as CompileResult | NodeSassResult;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // There are situations when the `file`/`span.url` property do not exist
            // Modern API
            if (error.span && error.span.url !== undefined) {
                this.deps.add(fileURLToPath(error.span.url));
            }
            // Legacy API
            else if (error.file !== undefined) {
                // `node-sass` returns POSIX paths
                this.deps.add(normalize(error.file));
            }

            throw errorFactory(error);
        }

        let resultMap: RawSourceMap | undefined =
            // Modern API, then legacy API
            (result as CompileResult).sourceMap ??
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            ((result as NodeSassResult).map ? (JSON.parse((result as NodeSassResult).map.toString()) as RawSourceMap) : undefined);

        // Modify source paths only for webpack, otherwise we do nothing
        if (resultMap && this.useSourcemap) {
            resultMap = normalizeSourceMap(resultMap, this.cwd as string);
        }

        // Modern API
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if ((result as CompileResult).loadedUrls !== undefined) {
            (result as CompileResult).loadedUrls
                .filter((loadedUrl) => loadedUrl.protocol === "file:")
                .forEach((includedFile) => {
                    const normalizedIncludedFile = fileURLToPath(includedFile);

                    // Custom `importer` can return only `contents` so includedFile will be relative
                    if (isAbsolute(normalizedIncludedFile)) {
                        this.deps.add(normalizedIncludedFile);
                    }
                });
        }
        // Legacy API
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        else if ((result as NodeSassResult).stats.includedFiles !== undefined) {
            (result as NodeSassResult).stats.includedFiles.forEach((includedFile: string) => {
                const normalizedIncludedFile = normalize(includedFile);

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

export type SassLoaderContext = {
    environment: Environment;
    resourcePath: string;
    rootContext: string;
};

export type SassLoaderOptions = {
    additionalData:
        | string
        | ((content: string | Buffer, loaderContext: SassLoaderContext) => string)
        | ((content: string | Buffer, loaderContext: SassLoaderContext) => Promise<string>);
    warnRuleAsWarning?: boolean;
} & (StringOptions<"async"> | NodeSassOptions);

// eslint-disable-next-line import/no-unused-modules
export default loader;
