import { existsSync } from "node:fs";

import { bold, cyan, gray } from "@visulima/colorize";
import { collectSync } from "@visulima/fs";
import type { NormalizedPackageJson } from "@visulima/package";
import { join } from "@visulima/path";

import type { BuildPreset } from "../types";
import warn from "../utils/warn";
import inferEntries from "./utils/infer-entries";
import overwriteWithPublishConfig from "./utils/overwrite-with-publish-config";

const autoPreset: BuildPreset = {
    hooks: {
        // eslint-disable-next-line sonarjs/cognitive-complexity
        "build:prepare": function (context) {
            // Disable auto if entries already provided of pkg not available
            if (context.options.entries.length > 0) {
                return;
            }

            const sourceDirectory = join(context.options.rootDir, "src");

            // eslint-disable-next-line security/detect-non-literal-fs-filename
            if (!existsSync(sourceDirectory)) {
                throw new Error("No 'src' directory found. Please provide entries manually.");
            }

            const sourceFiles = collectSync(sourceDirectory, { extensions: [], includeDirs: false, includeSymlinks: false });

            if (sourceFiles.length === 0) {
                throw new Error("No source files found in 'src' directory. Please provide entries manually.");
            }

            // eslint-disable-next-line @typescript-eslint/naming-convention
            let package_ = { ...context.pkg } as NormalizedPackageJson;

            if (package_.publishConfig) {
                package_ = overwriteWithPublishConfig(package_, context.options.declaration);
            }

            const result = inferEntries(package_, sourceFiles, context.options.declaration, context.options.rootDir);

            // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
            for (const message of result.warnings) {
                warn(context, message);
            }

            context.options.entries.push(...result.entries);

            if (context.options.emitCJS === undefined && result.cjs) {
                context.options.emitCJS = true;
            }

            if (context.options.emitESM === undefined && result.esm) {
                context.options.emitESM = true;
            }

            if (context.options.declaration === undefined && result.dts) {
                context.options.declaration = result.dts;
            }

            if (context.options.entries.length === 0) {
                throw new Error("No entries detected. Please provide entries manually.");
            } else {
                context.logger.info(
                    "Automatically detected entries:",
                    cyan(
                        context.options.entries

                            .map((buildEntry) => bold(buildEntry.input.replace(`${context.options.rootDir}/`, "").replace(/\/$/, "/*")))
                            .join(", "),
                    ),
                    gray(
                        [result.esm && "esm", result.cjs && "cjs", result.dts && "dts"]
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
