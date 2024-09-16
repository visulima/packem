import { existsSync } from "node:fs";

import { bold, cyan, gray } from "@visulima/colorize";
import { collectSync } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { join } from "@visulima/path";

import type { BuildContext, BuildPreset } from "../../types";
import warn from "../../utils/warn";
import inferEntries from "./utils/infer-entries";
import overwriteWithPublishConfig from "./utils/overwrite-with-publish-config";

const autoPreset: BuildPreset = {
    hooks: {
        "build:prepare": function (context: BuildContext) {
            // Disable auto if entries already provided of pkg not available
            if (context.options.entries.length > 0) {
                return;
            }

            const sourceDirectory = join(context.options.rootDir, context.options.sourceDir);

            // eslint-disable-next-line security/detect-non-literal-fs-filename
            if (!existsSync(sourceDirectory)) {
                throw new Error("No 'src' directory found. Please provide entries manually.");
            }

            const sourceFiles = collectSync(sourceDirectory, { extensions: [], includeDirs: false, includeSymlinks: false });

            if (sourceFiles.length === 0) {
                throw new Error("No source files found in 'src' directory. Please provide entries manually.");
            }

            let packageJson = { ...context.pkg } as NormalizedPackageJson;

            if (packageJson.publishConfig) {
                context.logger.info(
                    'Using publishConfig found in package.json, to override the default key-value pairs of "' +
                        Object.keys(packageJson.publishConfig).join(", ") +
                        '".',
                );
                context.logger.debug(packageJson.publishConfig);

                packageJson = overwriteWithPublishConfig(packageJson, context.options.declaration);
            }

            const result = inferEntries(packageJson, sourceFiles, context);

            for (const message of result.warnings) {
                warn(context, message);
            }

            context.options.entries.push(...result.entries);

            if (context.options.entries.length === 0) {
                throw new Error("No entries detected. Please provide entries manually.");
            } else {
                context.logger.info(
                    "Automatically detected entries:",
                    cyan(
                        context.options.entries

                            .map((buildEntry) => {
                                if (buildEntry.fileAlias) {
                                    return (
                                        bold(buildEntry.fileAlias) +
                                        " => " +
                                        bold(buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(/\/$/, "/*"))
                                    );
                                }

                                return bold(buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(/\/$/, "/*"));
                            })
                            .join(", "),
                    ),
                    gray(
                        [context.options.emitESM && "esm", context.options.emitCJS && "cjs", context.options.declaration && "dts"]
                            .filter(Boolean)
                            .map((tag) => `[${tag}]`)
                            .join(" "),
                    ),
                );
            }
        },
    },
};

export default autoPreset;
