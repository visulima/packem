import { formatBytes, parseBytes } from "@visulima/humanizer";
import { join } from "@visulima/path";
import picomatch from "picomatch";

import type { BuildContext, ValidationOptions } from "../types";
import warn from "../utils/warn";

// eslint-disable-next-line sonarjs/cognitive-complexity
const validateBundleSize = (context: BuildContext, logged: boolean): void => {
    const validation = context.options.validation as ValidationOptions;

    const { allowFail = false, limit: totalLimit, limits = {} } = validation.bundleLimit ?? {};

    // eslint-disable-next-line prefer-const
    for (let [path, limit] of Object.entries(limits)) {
        const foundEntry = context.buildEntries.find(
            (entry) => entry.path.endsWith(path.replace("./" + context.options.outDir, "")) || picomatch(path)(entry.path),
        );

        if (!foundEntry) {
            context.logger.debug({
                message: `Entry file not found: ${path}, please check your configuration.`,
                prefix: "Validation: File Size",
            });

            // eslint-disable-next-line no-continue
            continue;
        }

        if (foundEntry.size === undefined) {
            context.logger.debug({
                message: `Entry file has no size information: ${path}.`,
                prefix: "Validation: File Size",
            });

            // eslint-disable-next-line no-continue
            continue;
        }

        if (typeof limit === "string") {
            limit = parseBytes(limit);
        }

        if (!Number.isFinite(limit) || limit <= 0 || (foundEntry.size.bytes as number) <= limit) {
            // eslint-disable-next-line no-continue
            continue;
        } else {
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
        const totalSize = context.buildEntries.reduce((accumulator, entry) => accumulator + (entry.size?.bytes as number), 0);
        const maxLimit = typeof totalLimit === "string" ? parseBytes(totalLimit) : totalLimit;

        if (totalSize > maxLimit) {
            const message = `Total file size exceeds the limit: ${formatBytes(totalSize)} / ${formatBytes(maxLimit, {
                decimals: 2,
            })}`;

            if (allowFail) {
                if (logged && limits.length === 0) {
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
