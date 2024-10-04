import type { Pail } from "@visulima/pail";
import { extname, isAbsolute, join } from "@visulima/path";
import { pathToFileURL } from "mlly";
import type { Importer as NodeSassImporter, Options as NodeSassOptions } from "node-sass";
import type { PluginContext } from "rollup";
import type { Importer, SourceSpan, StringOptions } from "sass";

import type { SassLoaderContext, SassLoaderOptions } from "..";
import type { SassApiType } from "../types";

/**
 * Derives the sass options from the loader context and normalizes its values with sane defaults.
 */
const getSassOptions = async (
    loaderContext: SassLoaderContext,
    logger: Pail,
    warn: PluginContext["warn"],
    options: SassLoaderOptions,
    content: string,
    useSourceMap: boolean,
    apiType: SassApiType,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<SassLoaderOptions> => {
    const { warnRuleAsWarning, ...otherOptions } = options;
    const sassOptions = {
        ...otherOptions,
        data: options.additionalData
            ? typeof options.additionalData === "function"
                ? await options.additionalData(content, loaderContext)
                : `${options.additionalData}\n${content}`
            : content,
    };

    if (!(sassOptions as StringOptions<"async">).logger) {
        const needEmitWarning = warnRuleAsWarning !== false;
        const formatSpan = (span: SourceSpan) =>
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            `Warning on line ${span.start.line}, column ${span.start.column} of ${span.url ?? "-"}:${span.start.line}:${span.start.column}:\n`;
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        const formatDebugSpan = (span: SourceSpan) => `[debug:${span.start.line}:${span.start.column}] `;

        (sassOptions as StringOptions<"async">).logger = {
            debug(message, loggerOptions) {
                let builtMessage = "";

                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (loggerOptions.span) {
                    builtMessage = formatDebugSpan(loggerOptions.span);
                }

                builtMessage += message;

                logger.debug(builtMessage);
            },
            warn(message: string, loggerOptions) {
                let builtMessage = "";

                if (loggerOptions.deprecation) {
                    builtMessage += "Deprecation ";
                }

                if (loggerOptions.span) {
                    builtMessage += formatSpan(loggerOptions.span);
                }

                builtMessage += message;

                if (loggerOptions.span?.context) {
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                    builtMessage += `\n\n${loggerOptions.span.start.line} | ${loggerOptions.span.context}`;
                }

                if (loggerOptions.stack && loggerOptions.stack !== "null") {
                    builtMessage += `\n\n${loggerOptions.stack}`;
                }

                if (needEmitWarning) {
                    const warning = new Error(builtMessage);

                    warning.name = "SassWarning";
                    warning.stack = undefined;

                    warn(warning);
                } else {
                    logger.warn(builtMessage);
                }
            },
        };
    }

    const isModernAPI = apiType === "modern" || apiType === "modern-compiler";
    const { resourcePath } = loaderContext;

    if (isModernAPI) {
        (sassOptions as StringOptions<"async">).url = new URL(pathToFileURL(resourcePath));

        if (useSourceMap) {
            (sassOptions as StringOptions<"async">).sourceMap = true;
        }

        // If we are compiling sass and indentedSyntax isn't set, automatically set it.
        if ((sassOptions as StringOptions<"async">).syntax === undefined) {
            const extension = extname(resourcePath);

            if (extension && extension.toLowerCase() === ".scss") {
                (sassOptions as StringOptions<"async">).syntax = "scss";
            } else if (extension && extension.toLowerCase() === ".sass") {
                (sassOptions as StringOptions<"async">).syntax = "indented";
            } else if (extension && extension.toLowerCase() === ".css") {
                (sassOptions as StringOptions<"async">).syntax = "css";
            }
        }

        (sassOptions as StringOptions<"async">).loadPaths = [
            ...((sassOptions as StringOptions<"async">).loadPaths ? [...((sassOptions as StringOptions<"async">).loadPaths as string[])] : []).map(
                (includePath: string) => (isAbsolute(includePath) ? includePath : join(process.cwd(), includePath)),
            ),
            ...(process.env.SASS_PATH ? process.env.SASS_PATH.split(process.platform === "win32" ? ";" : ":") : []),
        ];

        (sassOptions as StringOptions<"async">).importers = (sassOptions as StringOptions<"async">).importers
            ? Array.isArray((sassOptions as StringOptions<"async">).importers)
                ? [...((sassOptions as StringOptions<"async">).importers as Importer[])]
                : (sassOptions as StringOptions<"async">).importers
            : [];
    } else {
        (sassOptions as NodeSassOptions).file = resourcePath;

        if (useSourceMap) {
            // Deliberately overriding the sourceMap option here.
            // node-sass won't produce source maps if the data option is used and options.sourceMap is not a string.
            // In case it is a string, options.sourceMap should be a path where the source map is written.
            // But since we're using the data option, the source map will not actually be written, but
            // all paths in sourceMap.sources will be relative to that path.
            // Pretty complicated... :(
            (sassOptions as NodeSassOptions).sourceMap = true;
            (sassOptions as NodeSassOptions).outFile = join(loaderContext.rootContext, "style.css.map");
            (sassOptions as NodeSassOptions).sourceMapContents = true;
            (sassOptions as NodeSassOptions).omitSourceMapUrl = true;
            (sassOptions as NodeSassOptions).sourceMapEmbed = false;
        }

        const extension = extname(resourcePath);

        // If we are compiling sass and indentedSyntax isn't set, automatically set it.
        (sassOptions as NodeSassOptions).indentedSyntax =
            extension && extension.toLowerCase() === ".sass" && (sassOptions as NodeSassOptions).indentedSyntax === undefined
                ? true
                : Boolean((sassOptions as NodeSassOptions).indentedSyntax);

        // Allow passing custom importers to `sass`/`node-sass`. Accepts `Function` or an array of `Function`s.
        (sassOptions as NodeSassOptions).importer = (sassOptions as NodeSassOptions).importer
            ? Array.isArray((sassOptions as NodeSassOptions).importer)
                ? [...((sassOptions as NodeSassOptions).importer as unknown as NodeSassImporter[])]
                : [(sassOptions as NodeSassOptions).importer as NodeSassImporter]
            : [];

        // Regression on the `sass-embedded` side
        if (((sassOptions as NodeSassOptions).importer as unknown as NodeSassImporter[]).length === 0) {
            (sassOptions as NodeSassOptions).importer = undefined;
        }

        (sassOptions as NodeSassOptions).includePaths = [
            ...[process.cwd()].flat(),
            ...((sassOptions as NodeSassOptions).includePaths ? [...((sassOptions as NodeSassOptions).includePaths as string[])] : []).map(
                (includePath: string) => (isAbsolute(includePath) ? includePath : join(process.cwd(), includePath)),
            ),
            ...(process.env.SASS_PATH ? process.env.SASS_PATH.split(process.platform === "win32" ? ";" : ":") : []),
        ];

        if ((sassOptions as NodeSassOptions).charset === undefined) {
            (sassOptions as NodeSassOptions).charset = true;
        }
    }

    return sassOptions;
};

export default getSassOptions;
