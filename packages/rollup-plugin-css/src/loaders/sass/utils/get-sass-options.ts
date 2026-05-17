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
        const formatSpan = (span: SourceSpan) => {
            const line = String(span.start.line);
            const column = String(span.start.column);
            const url = span.url ? String(span.url) : "-";

            return `Warning on line ${line}, column ${column} of ${url}:${line}:${column}:\n`;
        };

        const formatDebugSpan = (span: SourceSpan) => `[debug:${String(span.start.line)}:${String(span.start.column)}] `;

        (sassOptions as StringOptions<"async">).logger = {
            debug(message, loggerOptions) {
                let builtMessage = "";

                if (loggerOptions.span as SourceSpan | undefined) {
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
                    builtMessage += `\n\n${String(loggerOptions.span.start.line)} | ${loggerOptions.span.context}`;
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

    const normalizeIncludePath = function normalizeIncludePath(includePath: string): string {
        return isAbsolute(includePath) ? includePath : join(process.cwd(), includePath);
    };

    (sassOptions as StringOptions<"async">).loadPaths = [
        ...((sassOptions as StringOptions<"async">).loadPaths ? [...((sassOptions as StringOptions<"async">).loadPaths as string[])] : []).map((includePath) =>
            normalizeIncludePath(includePath),
        ),
        ...process.env.SASS_PATH ? process.env.SASS_PATH.split(separator) : [],
    ];

    if ((sassOptions as StringOptions<"async">).importers) {
        (sassOptions as StringOptions<"async">).importers = Array.isArray((sassOptions as StringOptions<"async">).importers)
            ? [...((sassOptions as StringOptions<"async">).importers as Importer[])]
            : (sassOptions as StringOptions<"async">).importers;
    } else {
        (sassOptions as StringOptions<"async">).importers = [];
    }

    return sassOptions;
};

export default getSassOptions;
