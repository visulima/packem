import { bold, cyan, gray } from "@visulima/colorize";
import { collectSync, isAccessibleSync } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { ALLOWED_TRANSFORM_EXTENSIONS_REGEX, EXCLUDE_REGEXP } from "@visulima/packem-share/constants";
import type { BuildContext } from "@visulima/packem-share/types";
import { join } from "@visulima/path";

import type { BuildConfig, InternalBuildOptions } from "../../types";
import inferEntries from "./utils/infer-entries";
import overwriteWithPublishConfig from "./utils/overwrite-with-publish-config";

// eslint-disable-next-line sonarjs/slow-regex -- bounded path segment match against collected file list
const DIST_PATH_REGEXP = /.*\/dist\/.*/;

const TRAILING_SLASH_REGEXP = /\/$/;

/**
 * Minimal structural view of the {@link BuildContext}'s `logger` (a `Pail`
 * instance). The `@visulima/pail` package's export map is not resolvable by
 * the typed-linting program (it resolves fine under `tsc`), which would
 * otherwise surface as `no-unsafe-*` false positives. Narrowing to the
 * methods actually used here keeps the call sites correctly typed.
 */
interface AutoPresetLogger {
    debug: (...arguments_: unknown[]) => void;
    info: (...arguments_: unknown[]) => void;
    warn: (...arguments_: unknown[]) => void;
}

const autoPreset: BuildConfig = {
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
                    skip: [EXCLUDE_REGEXP, DIST_PATH_REGEXP],
                });

                // Filter for TypeScript/JavaScript files
                const codeFiles = sourceFiles.filter((file) => ALLOWED_TRANSFORM_EXTENSIONS_REGEX.test(file) && !file.endsWith(".d.ts"));

                for (const file of codeFiles) {
                    const relativePath = file.replace(`${sourceDirectory}/`, "");
                    const name = relativePath.replace(ALLOWED_TRANSFORM_EXTENSIONS_REGEX, "").replaceAll("/", "/");

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
                skip: [EXCLUDE_REGEXP, DIST_PATH_REGEXP],
            });

            if (sourceFiles.length === 0) {
                throw new Error("No source files found in 'src' directory. Please provide entries manually.");
            }

            const logger = context.logger as AutoPresetLogger;

            let packageJson = { ...context.pkg } as NormalizedPackageJson;

            if (packageJson.publishConfig) {
                logger.info(
                    `Using publishConfig found in package.json, to override the default key-value pairs of "${Object.keys(packageJson.publishConfig).join(
                        ", ",
                    )}".`,
                );
                logger.debug(packageJson.publishConfig);

                packageJson = overwriteWithPublishConfig(packageJson, context.options.declaration);
            }

            // Unbundle mode is handled by the early branch above (which
            // returns), so by here we always run inferEntries.
            const result = await inferEntries(packageJson, sourceFiles, context);

            for (const message of result.warnings) {
                logger.warn(message);
            }

            context.options.entries.push(...result.entries);

            if (context.options.entries.length === 0) {
                throw new Error("No entries detected. Please provide entries manually.");
            } else {
                logger.info(
                    "Automatically detected entries:",
                    cyan(
                        context.options.entries
                            .map((buildEntry) => {
                                if (buildEntry.fileAlias) {
                                    return `${bold(buildEntry.fileAlias)} => ${bold(
                                        buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(TRAILING_SLASH_REGEXP, "/*"),
                                    )}`;
                                }

                                return bold(buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(TRAILING_SLASH_REGEXP, "/*"));
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
