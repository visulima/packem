import type { RollupLogger } from "@visulima/packem-share/utils";
import { extname, isAbsolute, join } from "@visulima/path";
import { isWindows } from "@visulima/path/utils";
import { pathToFileURL } from "mlly";
import type { Importer, SourceSpan, StringOptions } from "sass";

import type { SassLoaderContext, SassLoaderOptions } from "../types";
import resolveSyntax from "./resolve-syntax";

/**
 * Derives the sass options from the loader context and normalizes its values with sane defaults.
 */
const getSassOptions = async (
    loaderContext: SassLoaderContext,
    logger: RollupLogger,
    options: SassLoaderOptions,
    content: string,
    useSourceMap: boolean,
    // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<SassLoaderOptions> => {
    const { warnRuleAsWarning, ...otherOptions } = options;
    let data = content;

    if (options.additionalData) {
        data = typeof options.additionalData === "function" ? await options.additionalData(content, loaderContext) : `${options.additionalData}\n${content}`;
    }

    const sassOptions = {
        ...otherOptions,
        data,
    };

    if (!(sassOptions as StringOptions<"async">).logger) {
        const needEmitWarning = warnRuleAsWarning !== false;
        const formatSpan = (span: SourceSpan) =>
            `Warning on line ${span.start.line}, column ${span.start.column} of ${span.url ?? "-"}:${span.start.line}:${span.start.column}:\n`;

        const formatDebugSpan = (span: SourceSpan) => `[debug:${span.start.line}:${span.start.column}] `;

        (sassOptions as StringOptions<"async">).logger = {
            debug(message, loggerOptions) {
                let builtMessage = "";

                if (loggerOptions.span) {
                    builtMessage = formatDebugSpan(loggerOptions.span);
                }

                builtMessage += message;

                logger.info({ message: builtMessage });
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
                    builtMessage += `\n\n${loggerOptions.span.start.line} | ${loggerOptions.span.context}`;
                }

                if (loggerOptions.stack && loggerOptions.stack !== "undefined") {
                    builtMessage += `\n\n${loggerOptions.stack}`;
                }

                if (needEmitWarning) {
                    logger.warn({ message: builtMessage, name: "SassWarning" });
                } else {
                    logger.info({ message: builtMessage });
                }
            },
        };
    }

    const { resourcePath } = loaderContext;

    (sassOptions as StringOptions<"async">).url = new URL(pathToFileURL(resourcePath));

    if (useSourceMap) {
        (sassOptions as StringOptions<"async">).sourceMap = true;
    }

    // If we are compiling sass and indentedSyntax isn't set, automatically set it.
    if ((sassOptions as StringOptions<"async">).syntax === undefined) {
        const extension = extname(resourcePath);

        if (extension) {
            (sassOptions as StringOptions<"async">).syntax = resolveSyntax(extension.toLowerCase());
        }
    }

    const separator = isWindows() ? ";" : ":";

    (sassOptions as StringOptions<"async">).loadPaths = [
        ...((sassOptions as StringOptions<"async">).loadPaths ? [...((sassOptions as StringOptions<"async">).loadPaths as string[])] : []).map(
            (includePath: string) => (isAbsolute(includePath) ? includePath : join(process.cwd(), includePath)),
        ),
        ...process.env.SASS_PATH ? process.env.SASS_PATH.split(separator) : [],
    ];

    if ((sassOptions as StringOptions<"async">).importers) {
        if (Array.isArray((sassOptions as StringOptions<"async">).importers)) {
            (sassOptions as StringOptions<"async">).importers = [...((sassOptions as StringOptions<"async">).importers as Importer[])];
        } else {
            (sassOptions as StringOptions<"async">).importers = (sassOptions as StringOptions<"async">).importers;
        }
    } else {
        (sassOptions as StringOptions<"async">).importers = [];
    }

    return sassOptions;
};

export default getSassOptions;
