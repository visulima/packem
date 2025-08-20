import { formatBytes, parseBytes } from "@visulima/humanizer";
import type { BuildContext } from "@visulima/packem-share/types";
import { warn } from "@visulima/packem-share/utils";
import { join } from "@visulima/path";
import picomatch from "picomatch";

import type { InternalBuildOptions, ValidationOptions } from "../types";

const validateBundleSize = (
    context: BuildContext<InternalBuildOptions>,
    logged: boolean,
): void => {
    const validation = context.options.validation as ValidationOptions;

    const {
        allowFail = false,
        limit: totalLimit,
        limits = {},
    } = validation.bundleLimit ?? {};

    for (const [path, rawLimit] of Object.entries(limits)) {
        const limit
            = typeof rawLimit === "string" ? parseBytes(rawLimit) : rawLimit;

        if (!Number.isFinite(limit) || limit <= 0) {
            context.logger.debug({
                message: `Invalid limit for ${path}: ${rawLimit}`,
                prefix: "Validation: File Size",
            });

            continue;
        }

        const foundEntry = context.buildEntries.find((entry) => {
            const normalizedPath = path.replace(
                new RegExp(`^.?/?${context.options.outDir}/?`),
                "",
            );

            return (
                entry.path.endsWith(normalizedPath)
                || picomatch(path)(entry.path)
            );
        });

        if (!foundEntry?.size?.bytes) {
            context.logger.debug({
                message: foundEntry
                    ? `Entry file has no size information: ${path}.`
                    : `Entry file not found: ${path}, please check your configuration.`,
                prefix: "Validation: File Size",
            });

            continue;
        }

        if (foundEntry.size.bytes > limit) {
            const message = `File size exceeds the limit: ${join(context.options.outDir, foundEntry.path)} (${formatBytes(foundEntry.size.bytes as number)} / ${formatBytes(
                limit,
                {
                    decimals: 2,
                },
            )})`;

            if (allowFail) {
                if (logged) {
                    context.logger.raw("\n");
                }

                context.logger.warn({
                    message,
                    prefix: "validation:file-size",
                });
            } else {
                warn(context, message);
            }
        }
    }

    if (totalLimit) {
        // eslint-disable-next-line unicorn/no-array-reduce
        const totalSize = context.buildEntries.reduce((accumulator, entry) => {
            const bytes = entry.size?.bytes;

            return accumulator + (typeof bytes === "number" ? bytes : 0);
        }, 0);

        const maxLimit
            = typeof totalLimit === "string"
                ? parseBytes(totalLimit)
                : totalLimit;

        if (!Number.isFinite(maxLimit) || maxLimit <= 0) {
            context.logger.debug({
                message: `Invalid total limit: ${totalLimit}`,
                prefix: "Validation: File Size",
            });

            return;
        }

        if (totalSize > maxLimit) {
            const message = `Total file size exceeds the limit: ${formatBytes(totalSize)} / ${formatBytes(
                maxLimit,
                {
                    decimals: 2,
                },
            )}`;

            if (allowFail) {
                if (logged && Object.keys(limits).length === 0) {
                    context.logger.raw("\n");
                }

                context.logger.warn({
                    message,
                    prefix: "validation:file-size",
                });
            } else {
                warn(context, message);
            }
        }
    }
};

export default validateBundleSize;
