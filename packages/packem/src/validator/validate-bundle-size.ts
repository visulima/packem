import { formatBytes, parseBytes } from "@visulima/humanizer";
import type { BuildContext } from "@visulima/packem-share/types";
import { warn } from "@visulima/packem-share/utils";
import { join } from "@visulima/path";
import picomatch from "picomatch";

import type { InternalBuildOptions, ValidationOptions } from "../types";
import escapeRegExp from "../utils/escape-regexp";

/**
 * Minimal structural view of the Pail logger.
 *
 * `@visulima/pail`'s `dist/index.server.d.ts` re-exports `Pail` from a
 * non-existent `./pail.d.ts` (the real file is `./pail.server.d.ts`), so the
 * upstream `Pail` type used by `BuildContext.logger` resolves to an error type.
 * That makes every `context.logger.*` access trip `no-unsafe-*`. Until the
 * upstream package fixes its re-export, we narrow the logger to the subset of
 * methods this module actually uses; the runtime object implements them.
 */
interface LogPayload {
    message: string;
    prefix: string;
}

interface Logger {
    debug: (payload: LogPayload) => void;
    raw: (message: string) => void;
    warn: (payload: LogPayload) => void;
}

const getLogger = (context: BuildContext<InternalBuildOptions>): Logger => context.logger as Logger;

const FILE_SIZE_PREFIX = "Validation: File Size";

type SizeLimit = number | `${number}${"B" | "GB" | "KB" | "MB" | "TB"}`;

const resolveLimit = (rawLimit: SizeLimit): number => {
    if (typeof rawLimit === "string") {
        return parseBytes(rawLimit);
    }

    return rawLimit;
};

const emitMessage = (logger: Logger, message: string, allowFail: boolean, context: BuildContext<InternalBuildOptions>, addBlankLine: boolean): void => {
    if (allowFail) {
        if (addBlankLine) {
            logger.raw("\n");
        }

        logger.warn({
            message,
            prefix: "validation:file-size",
        });

        return;
    }

    warn(context, message);
};

const checkPerFileLimits = (
    context: BuildContext<InternalBuildOptions>,
    logger: Logger,
    limits: Record<string, SizeLimit>,
    allowFail: boolean,
    logged: boolean,
): void => {
    for (const [path, rawLimit] of Object.entries(limits)) {
        const limit = resolveLimit(rawLimit);

        if (!Number.isFinite(limit) || limit <= 0) {
            logger.debug({
                message: `Invalid limit for ${path}: ${String(rawLimit)}`,
                prefix: FILE_SIZE_PREFIX,
            });

            continue;
        }

        const foundEntry = context.buildEntries.find((entry) => {
            const normalizedPath = path.replace(new RegExp(`^.?/?${escapeRegExp(context.options.outDir)}/?`), "");

            return entry.path.endsWith(normalizedPath) || picomatch(path)(entry.path);
        });

        if (!foundEntry?.size?.bytes) {
            logger.debug({
                message: foundEntry ? `Entry file has no size information: ${path}.` : `Entry file not found: ${path}, please check your configuration.`,
                prefix: FILE_SIZE_PREFIX,
            });

            continue;
        }

        if (foundEntry.size.bytes > limit) {
            const message = `File size exceeds the limit: ${join(context.options.outDir, foundEntry.path)} (${formatBytes(foundEntry.size.bytes)} / ${formatBytes(
                limit,
                {
                    decimals: 2,
                },
            )})`;

            emitMessage(logger, message, allowFail, context, logged);
        }
    }
};

const checkTotalLimit = (
    context: BuildContext<InternalBuildOptions>,
    logger: Logger,
    totalLimit: SizeLimit,
    allowFail: boolean,
    addBlankLine: boolean,
): void => {
    // eslint-disable-next-line unicorn/no-array-reduce
    const totalSize = context.buildEntries.reduce((accumulator, entry) => {
        const bytes = entry.size?.bytes;

        return accumulator + (typeof bytes === "number" ? bytes : 0);
    }, 0);

    const maxLimit = resolveLimit(totalLimit);

    if (!Number.isFinite(maxLimit) || maxLimit <= 0) {
        logger.debug({
            message: `Invalid total limit: ${String(totalLimit)}`,
            prefix: FILE_SIZE_PREFIX,
        });

        return;
    }

    if (totalSize > maxLimit) {
        const message = `Total file size exceeds the limit: ${formatBytes(totalSize)} / ${formatBytes(maxLimit, {
            decimals: 2,
        })}`;

        emitMessage(logger, message, allowFail, context, addBlankLine);
    }
};

const validateBundleSize = (context: BuildContext<InternalBuildOptions>, logged: boolean): void => {
    const validation = context.options.validation as ValidationOptions;

    const { allowFail = false, limit: totalLimit, limits = {} } = validation.bundleLimit ?? {};

    const logger = getLogger(context);

    checkPerFileLimits(context, logger, limits, allowFail, logged);

    if (totalLimit) {
        checkTotalLimit(context, logger, totalLimit, allowFail, logged && Object.keys(limits).length === 0);
    }
};

export default validateBundleSize;
