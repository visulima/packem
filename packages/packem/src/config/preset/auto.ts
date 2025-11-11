import { bold, cyan, gray } from "@visulima/colorize";
import { collectSync, isAccessibleSync } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import type { BuildContext } from "@visulima/packem-share/types";
import { warn } from "@visulima/packem-share/utils";
import { join } from "@visulima/path";

import type { BuildPreset, InternalBuildOptions } from "../../types";
import inferEntries from "./utils/infer-entries";
import overwriteWithPublishConfig from "./utils/overwrite-with-publish-config";

const autoPreset: BuildPreset = {
    hooks: {
        "build:prepare": async function (context: BuildContext<InternalBuildOptions>) {
            // For unbundle mode, always create entries for all source files
            if (context.options.unbundle) {
                // Clear existing entries
                context.options.entries.length = 0;

                const sourceDirectory = join(context.options.rootDir, context.options.sourceDir);

                if (!isAccessibleSync(sourceDirectory)) {
                    throw new Error("No 'src' directory found. Please provide entries manually.");
                }

                const sourceFiles = collectSync(sourceDirectory, {
                    extensions: [],
                    includeDirs: false,
                    includeSymlinks: false,
                    skip: [/.*\/node_modules\/.*/, /.*\/dist\/.*/],
                });

                // Filter for TypeScript/JavaScript files
                const codeFiles = sourceFiles.filter((file) =>
                    /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(file) && !file.endsWith(".d.ts"),
                );

                for (const file of codeFiles) {
                    const relativePath = file.replace(`${sourceDirectory}/`, "");
                    const name = relativePath.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, "").replaceAll("/", "/");

                    context.options.entries.push({
                        input: file,
                        name,
                    });
                }

                // Don't run the normal auto logic
                return;
            }

            // Disable auto if entries already provided of pkg not available
            if (context.options.entries.length > 0) {
                return;
            }

            const sourceDirectory = join(context.options.rootDir, context.options.sourceDir);

            if (!isAccessibleSync(sourceDirectory)) {
                throw new Error("No 'src' directory found. Please provide entries manually.");
            }

            const sourceFiles = collectSync(sourceDirectory, {
                extensions: [],
                includeDirs: false,
                includeSymlinks: false,
                skip: [/.*\/node_modules\/.*/, /.*\/dist\/.*/],
            });

            if (sourceFiles.length === 0) {
                throw new Error("No source files found in 'src' directory. Please provide entries manually.");
            }

            let packageJson = { ...context.pkg } as NormalizedPackageJson;

            if (packageJson.publishConfig) {
                context.logger.info(
                    `Using publishConfig found in package.json, to override the default key-value pairs of "${Object.keys(packageJson.publishConfig).join(
                        ", ",
                    )}".`,
                );
                context.logger.debug(packageJson.publishConfig);

                packageJson = overwriteWithPublishConfig(packageJson, context.options.declaration);
            }

            // For unbundle mode, create entries for all source files
            if (context.options.unbundle) {
                context.logger.info("Unbundle mode detected, creating entries for all source files");

                // Filter for TypeScript/JavaScript files
                const codeFiles = sourceFiles.filter((file) =>
                    /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(file) && !file.endsWith(".d.ts"),
                );

                context.logger.info(`Found ${codeFiles.length} code files for unbundle mode`);

                for (const file of codeFiles) {
                    const relativePath = file.replace(`${sourceDirectory}/`, "");
                    const name = relativePath.replace(/\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/, "").replaceAll("/", "/");

                    context.logger.info(`Adding entry: ${name} -> ${file}`);

                    context.options.entries.push({
                        input: file,
                        name,
                    });
                }
            } else {
                const result = await inferEntries(packageJson, sourceFiles, context);

                for (const message of result.warnings) {
                    warn(context, message);
                }

                context.options.entries.push(...result.entries);
            }

            if (context.options.entries.length === 0) {
                throw new Error("No entries detected. Please provide entries manually.");
            } else {
                context.logger.info(
                    "Automatically detected entries:",
                    cyan(
                        context.options.entries
                            .map((buildEntry) => {
                                if (buildEntry.fileAlias) {
                                    return `${bold(buildEntry.fileAlias)} => ${bold(
                                        buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(/\/$/, "/*"),
                                    )}`;
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
